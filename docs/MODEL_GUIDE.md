# Local LLM Model Guide for Companion AI

> **Audience:** You just downloaded LM Studio and want to pick a good model for your AI companion. You are not an ML engineer. This guide will get you up and running with the right model for your hardware without needing a PhD.

---

## Table of Contents

1. [Introduction](#introduction)
2. [Model Types for Companion AI](#model-types-for-companion-ai)
3. [Understanding Parameter Counts](#understanding-parameter-counts)
4. [Understanding Quantization](#understanding-quantization)
5. [Understanding Speed](#understanding-speed)
6. [Expected Speeds by Model Size](#expected-speeds-by-model-size)
7. [Key RP Model Families](#key-rp-model-families)
8. [Roleplay & Uncensored Models](#roleplay--uncensored-models)
9. [Hardware Tiers](#hardware-tiers)
10. [CPU Offloading Guide](#cpu-offloading-guide)
11. [LM Studio Settings for RP](#lm-studio-settings-for-rp)
12. [Benchmarks That Matter](#benchmarks-that-matter)
13. [Multi-Model Loading with LM Studio Link](#multi-model-loading-with-lm-studio-link)

---

## Introduction

Picking a local LLM for companion AI is confusing. There are thousands of models on HuggingFace, dozens of quantization formats, and endless Reddit debates about which 7B model is "actually good." This guide cuts through the noise.

**What this guide covers:**

- Which *type* of model works best for AI companions (it's not what you think)
- How to pick a model size that fits your GPU
- What quantization formats mean and which to pick
- Specific model recommendations per hardware tier
- LM Studio settings that actually matter for roleplay and conversation
- How to evaluate models without running academic benchmarks

**What this guide does NOT cover:**

- Coding assistants, RAG pipelines, or enterprise use cases
- Fine-tuning or training your own models
- Cloud API models (OpenAI, Claude, etc.) — see the main Settings page for those

**Who is this for?**

You have a computer with a decent GPU (or an Apple Silicon Mac), you've installed LM Studio, and you want your AI companion to be expressive, stay in character, and not sound like a corporate chatbot. Let's go.

---

## Model Types for Companion AI

Not all models are created equal. The same base architecture (like Llama 3 or Mistral) gets released in different "flavors" depending on how it was trained after the initial pre-training phase.

| Type | What It Is | Good For Companion AI? | Examples |
|------|-----------|----------------------|----------|
| **Base** | Raw pre-trained model. Predicts the next token based on internet text. No instruction following. | **No.** Will ramble, repeat itself, and ignore your character card entirely. Avoid these. | `Llama-3.1-8B` (no "-Instruct" suffix) |
| **Instruct** | Fine-tuned to follow instructions and answer questions. Has safety guardrails baked in. | **Mediocre.** Will follow instructions but tends to be dry, refuses creative scenarios, and breaks character to lecture you. | `Llama-3.1-8B-Instruct`, `Mistral-7B-Instruct-v0.3` |
| **RP-Tuned** | Fine-tuned specifically for roleplay, creative writing, and character consistency. Built on top of instruct or base models with curated RP datasets. | **Yes — this is what you want.** Stays in character, writes expressively, handles emotions naturally, and won't refuse reasonable creative scenarios. | `Sao10K/L3.3-euryale-v2.3-70B`, `TheDrummer/Anubis-Pro-105B-v1` |

**The takeaway:** Always look for RP-tuned models for companion AI. An RP-tuned 8B model will dramatically outperform a vanilla instruct 8B model for this use case. The difference is night and day.

### How to Spot an RP-Tuned Model

- The model card mentions "roleplay," "creative writing," "character card," or "SillyTavern"
- The creator is known in the RP community (see [Key RP Model Families](#key-rp-model-families) below)
- The training data includes curated RP conversations rather than just instruction-following pairs
- The model name often hints at it: Euryale, Noromaid, Rocinante, Anubis, etc.

---

## Understanding Parameter Counts

A model's parameter count (3B, 7B, 14B, 70B, etc.) is roughly how "smart" the model is. More parameters means more capacity to understand nuance, maintain long conversations, and produce creative writing — but also means more VRAM and slower generation.

| Size | Analogy | Companion AI Quality | Typical VRAM (Q4_K_M) |
|------|---------|---------------------|----------------------|
| **3-4B** | A friendly parrot — can mimic conversation patterns but doesn't truly understand context. Forgets things quickly. | Usable for quick testing. Conversations feel shallow after 5-10 exchanges. Characters drift and repeat themselves. | ~2.5-3 GB |
| **7-8B** | A clever teenager — can hold a conversation, gets the gist of your character, but sometimes says things that feel "off." | The entry point for real companion AI. Good character voice with the right RP tune. Starts to struggle with complex multi-paragraph responses. | ~5-6 GB |
| **12-14B** | A well-read college student — noticeably better at context, emotional nuance, and staying in character over long conversations. | The sweet spot for most users. Strong character consistency, good emotional range, handles long context well. | ~8-10 GB |
| **22-24B** | An experienced writer — handles subtle emotional beats, remembers conversation threads, and produces genuinely creative responses. | Excellent quality. Noticeable jump from 14B in writing quality and coherence. Worth it if your GPU can handle it. | ~13-15 GB |
| **32-35B** | A professional novelist — rich vocabulary, complex emotional reasoning, maintains multiple conversation threads effortlessly. | Outstanding. Diminishing returns start here for casual use, but the quality ceiling is high. | ~19-21 GB |
| **70B+** | A master storyteller — the best local models available. Nuanced, creative, and deeply consistent. | The gold standard for local companion AI. Requires serious hardware or aggressive quantization. | ~38-42 GB |

**The practical advice:** For most people, **12-14B RP-tuned at Q4_K_M or Q5_K_M** is the best balance of quality and speed. If you have a 16GB GPU, this is your target. If you have 8GB, aim for 7-8B.

---

## Understanding Quantization

Quantization compresses a model to use less VRAM and run faster, at the cost of some quality. Think of it like image compression: a JPEG looks almost as good as a PNG but is much smaller.

The original model weights are stored in 16-bit floating point (FP16). Quantization reduces the precision of those weights to fewer bits per parameter. Lower bits = smaller file = less VRAM = slightly lower quality.

### Quick GGUF Size Reference

How much VRAM does each quantization level actually use? This table gives you the raw model size (before KV cache overhead) for common parameter counts.

| Quant   | Quality    | 7B    | 13B    | 70B    |
|---------|-----------|-------|--------|--------|
| Q4_K_M  | Good      | ~4 GB | ~8 GB  | ~40 GB |
| Q5_K_M  | Better    | ~5 GB | ~9 GB  | ~48 GB |
| Q8_0    | Near-FP16 | ~7 GB | ~14 GB | ~72 GB |
| FP16    | Lossless  | ~14 GB| ~26 GB | ~140 GB|

> **Rule of thumb:** Your actual VRAM usage = model size + 1-2 GB (OS/driver) + KV cache (depends on context length). A Q4_K_M 14B model at 8K context uses roughly 10-11 GB total.

| Format | Bits per Weight | Quality Loss | Best For | Notes |
|--------|----------------|-------------|----------|-------|
| **FP16** | 16 bits | None (original) | Research, benchmarking | Twice the VRAM of Q8. Almost nobody runs this locally for inference. |
| **FP8** | 8 bits | Negligible | High-end GPUs with lots of VRAM | Excellent quality, ~50% smaller than FP16. Good if you have headroom. |
| **Q6_K** | ~6.5 bits | Very slight | Quality-first users with VRAM to spare | Nearly indistinguishable from FP16 in blind tests. |
| **Q5_K_M** | ~5.5 bits | Slight | Recommended if it fits | Great quality-to-size ratio. Most people can't tell the difference from Q6_K. |
| **Q4_K_M** | ~4.5 bits | Minor | **The default choice for most users** | The community standard. Best balance of quality, speed, and VRAM usage. Start here. |
| **IQ4_XS** | ~4.25 bits | Minor-to-moderate | Squeezing a model that barely fits | Slightly smaller than Q4_K_M with comparable quality. Uses importance-weighted quantization. Good for tight VRAM budgets. |
| **EXL2 2.5bpw** | 2.5 bits | Moderate | Running 70B on 16GB VRAM | ExLlamaV2 format. Aggressive compression but surprisingly coherent for 70B models. Requires ExLlamaV2 backend. |
| **EXL2 2.25bpw** | 2.25 bits | Moderate-to-heavy | Absolute minimum for 70B | You'll notice quality loss, but a 70B at 2.25bpw can still outperform a 14B at Q4_K_M for complex reasoning. Requires ExLlamaV2 backend. |
| **int4 (MLX)** | 4 bits | Minor | Apple Silicon Macs | MLX-native format optimized for unified memory. Equivalent quality to Q4_K_M. Use this on M-series Macs. |

### Quick Decision Tree

```
Do you have VRAM headroom after loading the model?
├── Yes, lots (4+ GB free) → Use Q5_K_M or Q6_K
├── Yes, some (1-2 GB free) → Use Q4_K_M (the safe default)
├── Barely fits → Use IQ4_XS
├── Doesn't fit at all → Drop to a smaller model size, or try EXL2 2.5bpw
└── On a Mac? → Use MLX int4 format
```

### Which Quantization Provider?

On HuggingFace, you'll see the same model quantized by different people. Some well-known quantizers who consistently produce high-quality GGUF files:

- **bartowski** — Reliable, wide coverage, usually the first to quantize new models
- **mradermacher** — Huge catalog, auto-quantizes nearly everything
- **MaziyarPanahi** — Good quality, consistent naming

For EXL2 formats, look for quantizations by **turboderp** (the creator of ExLlamaV2) or other known community members.

---

## Understanding Speed

Two numbers matter when you're chatting with your AI companion:

### TTFT — Time to First Token

**What it means in plain English:** How long you wait after pressing Enter before the AI starts typing its response.

This is the "thinking" pause. The model reads your entire conversation history, processes it, and produces the first word of its reply. Longer conversations and larger models mean longer TTFT.

| TTFT | How It Feels |
|------|-------------|
| < 1 second | Instant. Like texting a fast friend. |
| 1-3 seconds | Natural pause. Like someone thinking before they speak. |
| 3-6 seconds | Noticeable wait. Still fine for casual chatting. |
| 6-10 seconds | Slow. You start wondering if something broke. |
| 10+ seconds | Painful. Breaks conversational flow completely. |

**For voice conversations**, TTFT is critical — anything over 2 seconds feels awkward in spoken dialogue.

### tok/s — Tokens per Second

**What it means in plain English:** How fast the AI "types" its response once it starts. One token is roughly 3/4 of a word, so 30 tok/s means the AI is writing about 22 words per second.

| Speed | How It Feels |
|-------|-------------|
| 60+ tok/s | Faster than you can read. Text appears instantly. |
| 30-60 tok/s | Very fast. Smooth streaming, no waiting. |
| 15-30 tok/s | Good. Text streams in comfortably. |
| 8-15 tok/s | Acceptable. You can read along as it types. |
| 3-8 tok/s | Slow. You're waiting between paragraphs. |
| < 3 tok/s | Unusable for real-time conversation. |

**For voice conversations**, you need at least 15-20 tok/s for the text-to-speech pipeline to sound natural. Below that, there will be audible gaps.

---

## Expected Speeds by Model Size

These are approximate generation speeds (tok/s) at Q4_K_M quantization with the full model loaded in VRAM (no CPU offloading). Your actual speeds will vary based on context length, batch size, and system configuration.

| Model Size | RTX 5080 (16GB GDDR7) | M2 Pro (16GB Unified) | RTX 3070 (8GB GDDR6) |
|-----------|----------------------|----------------------|---------------------|
| **3-4B** | 90-120 tok/s | 40-55 tok/s | 60-80 tok/s |
| **7-8B** | 55-75 tok/s | 25-35 tok/s | 35-50 tok/s |
| **12-14B** | 35-50 tok/s | 15-22 tok/s | Does not fit* |
| **22-24B** | 20-30 tok/s | 8-14 tok/s | Does not fit* |
| **32-35B** | Does not fit** | 5-9 tok/s | Does not fit* |
| **70B** | EXL2 2.5bpw: 10-15 tok/s | 2-4 tok/s | Does not fit* |

\* Can run with CPU offloading at significantly reduced speed (see [CPU Offloading Guide](#cpu-offloading-guide)).

\** Can run at very aggressive quantization (IQ3_XS) or with partial CPU offload. Quality trade-off is steep.

**Key observations:**

- **RTX 5080** owners: 14B Q4_K_M is the sweet spot — fast enough for voice, high quality, fits easily.
- **M2 Pro** owners: 8B MLX int4 is the comfortable choice. 14B is possible but voice conversations may feel sluggish.
- **RTX 3070** owners: 8B Q4_K_M is your ceiling for full-speed inference. Excellent RP-tuned 8B models exist — you won't feel limited.

---

## Key RP Model Families

These creators consistently produce the best models for roleplay and companion AI. When a new base model drops (Llama 4, Mistral Large, etc.), these are the people who fine-tune it for creative conversation.

### Sao10K

The gold standard for RP fine-tunes. Known for the **Euryale** and **L3-Stheno** series. Models are carefully trained on curated datasets with a focus on character consistency, emotional depth, and natural dialogue flow. Euryale 70B is widely considered one of the best local RP models ever released. Available in smaller sizes too.

### NeverSleep

Creators of the **Noromaid** series. Known for producing models that handle intimate and emotionally complex scenarios with maturity and coherence. Their models tend to have excellent prose quality and strong character voice. Often among the top-ranked models on community leaderboards.

### TheDrummer

Known for the **Anubis** and **Rocinante** series. TheDrummer's models tend to be excellent at following complex system prompts and maintaining multi-faceted characters. The Anubis Pro series pushes into larger parameter counts (105B+) for users with the hardware to run them. Also releases smaller, highly optimized models.

### ArliAI

Creators of various RP-oriented fine-tunes. Known for models that balance instruction following with creative freedom. Good at producing models that work well with structured character cards and don't over-censor creative scenarios.

### sophosympatheia

Produces thoughtful fine-tunes with a focus on philosophical depth, emotional intelligence, and nuanced conversation. Models tend to produce longer, more contemplative responses. Good for users who want their companion to feel "deep" rather than just entertaining.

### Nitral-AI

Known for merge-based models that combine the strengths of multiple fine-tunes. Their models often score well on RP benchmarks while maintaining general intelligence. Good all-rounders when you want a single model for both companion chat and occasional utility tasks.

### elinas

Produces creative-writing-focused fine-tunes with strong narrative voice. Models from elinas tend to excel at descriptive prose and maintaining story coherence over long conversations. Particularly good for users who enjoy more literary-style interactions with their companions.

### Cognitive Computations

Creators of the **Dolphin** series. Pioneer of the "uncensored" model movement. Dolphin models start from strong base models and are fine-tuned on datasets with alignment/refusal examples removed. Good general-purpose uncensored models that work well for companion chat when you want zero refusals without RP-specific tuning.

### nocudaexe

Creator of **Neural-Dark-Waifu** and **Infinite-Waifu** — models specifically fine-tuned for anime companion and waifu-style RP. Smaller community creator but highly specialized for this exact use case. Models tend to be 8B range, optimized for character consistency in companion scenarios.

### How to Find These Models

1. Search HuggingFace for the creator name (e.g., `Sao10K`)
2. Sort by "Most Downloads" or "Trending"
3. Look for GGUF quantized versions (often uploaded by bartowski or mradermacher)
4. Read the model card — good RP models always describe their training data and intended use case

---

## Roleplay & Uncensored Models

One of the key advantages of running LLMs locally is the absence of cloud-based content filters. "Uncensored" or "abliterated" models have had their alignment training removed or reduced, allowing full creative freedom for roleplay scenarios that cloud providers would refuse. These models are for local use only — your hardware, your rules. Responsible use is expected.

### Uncensored Model Techniques

| Technique | What It Means | Examples |
|-----------|--------------|----------|
| **Abliteration** | Alignment vectors surgically removed from model weights. Model retains full capability but won't refuse creative scenarios. | huihui-ai abliterated series |
| **DPO on uncensored data** | Trained with Direct Preference Optimization on datasets without refusal examples. | NeverSleep Lumimaid, Noromaid |
| **RP-tuned from base** | Fine-tuned from base model (not instruct) so no refusal behavior was ever learned. | Sao10K Euryale, many TheDrummer models |
| **Merge/Franken** | Multiple models merged to combine strengths and dilute alignment. | Midnight Miqu, Goliath |

### Recommended Uncensored/RP Models by VRAM Tier

#### 8GB VRAM

| Model | Size | Quant | Notes |
|-------|------|-------|-------|
| Neural-Dark-Waifu v0.2 | 8B | Q4_K_M | nocudaexe — specifically tuned for companion/waifu RP |
| Infinite-Waifu | 8B | Q4_K_M | nocudaexe — creative uncensored companion chat |
| Lumimaid 8B v0.2 | 8B | Q4_K_M | NeverSleep — emotional depth, uncensored, top-tier 8B RP |
| Qwen3.5-9B Uncensored | 9B | IQ4_XS | HauhauCS — aggressive abliteration of Qwen3.5, tight fit |
| Qwen3.5-9B Abliterated | 9B | IQ4_XS | huihui-ai — cleaner abliteration, good instruction following |

#### 16GB VRAM (RTX 5080 sweet spot)

| Model | Size | Quant | Notes |
|-------|------|-------|-------|
| Magnum v4 12B | 12B | Q4_K_M | TheDrummer — excellent emotional range, uncensored |
| Rocinante-X 12B | 12B | Q5_K_M | TheDrummer — fresh writing style, robust RP |
| Qwen3.5-9B Uncensored | 9B | Q5_K_M | Comfortable fit at higher quant, fast |
| Euryale 70B v2.3 | 70B | EXL2 2.5bpw | Sao10K — gold standard RP, extreme compression |
| Midnight Miqu 70B | 70B | EXL2 2.5bpw | Merge model — uncensored, strong creative writing |
| Cydonia 24B v4.3 | 24B | Q4_K_M | TheDrummer — premium pick, 14GB, fresh non-repetitive |

#### 24GB+ VRAM

| Model | Size | Quant | Notes |
|-------|------|-------|-------|
| Euryale 70B v2.3 | 70B | Q4_K_M | Sao10K — full quality, no compression trade-offs |
| Midnight Miqu 103B | 103B | EXL2 2.5bpw | Maximum uncensored quality |
| Anubis Pro 105B | 105B | EXL2 2.5bpw | TheDrummer — latest large RP model |

### Prompt Format Reference

LM Studio auto-detects the correct prompt format from model metadata in most cases. If your model produces garbled output, **wrong prompt format is the #1 cause.** Check the model card on HuggingFace for the correct template.

| Model Family | Prompt Format | Notes |
|-------------|--------------|-------|
| Llama 3 / 3.1 / 3.2 / 3.3 | Llama 3 (llama3) | `<\|begin_of_text\|><\|start_header_id\|>system<\|end_header_id\|>` |
| Mistral / Mistral Nemo | Mistral v1 | `[INST]` / `[/INST]` wrapping |
| Qwen 3 / Qwen 3.5 | ChatML | `<\|im_start\|>system` ... `<\|im_end\|>` |
| Gemma / Gemma 2 | Gemma | `<start_of_turn>user` ... `<end_of_turn>` |
| Command R+ | Command R | Cohere format |
| Phi-3 | Phi-3 | `<\|system\|>` ... `<\|end\|>` |

### Notable Mentions: Voice & Speech Models

These are local voice pipeline models you may want to pair with your LLM for a complete companion experience.

| Model | Type | Notes |
|-------|------|-------|
| hexgrad/Kokoro-82M | TTS | Tiny, fast, 82M params. Built into Waifu-RT3D. |
| fishaudio/s2-pro | TTS | High quality voice cloning. FP8 available. |
| ResembleAI/chatterbox | TTS | Emotional TTS with voice cloning. |
| nari-labs/Dia-1.6B | TTS | Dialogue-aware TTS — different intonation for different speakers. |
| Qwen/Qwen3-TTS | TTS | Qwen's TTS model with voice design capabilities. |
| openai/whisper-large-v3-turbo | STT | Gold standard speech recognition. |
| Qwen/Qwen3-ASR-0.6B | STT | Tiny, fast ASR — 0.6B params. |
| nvidia/parakeet-tdt-0.6b-v3 | STT | NVIDIA's fast streaming ASR. |
| HumeAI/tada-1b | Emotion | Emotion-aware speech synthesis. |

---

## Hardware Tiers

### Tier 1: 8GB VRAM (RTX 3060 8GB, RTX 3070, RTX 4060, etc.)

**Your budget: 7-8B models at Q4_K_M**

After loading a model, LM Studio itself and your OS need ~1-2 GB of VRAM, so you really have about 6-7 GB for the model.

| Recommendation | Size | Why |
|---------------|------|-----|
| Sao10K L3-Stheno 8B (Q4_K_M) | ~5.5 GB | Strong character consistency, natural dialogue. |
| NeverSleep Noromaid 8B (Q4_K_M) | ~5.5 GB | Excellent prose quality and emotional range. |
| Any RP-tuned Llama 3.1 8B (Q5_K_M) | ~6 GB | You might have room for Q5_K_M at this size — worth trying. |

**Tips for 8GB users:**
- Close other GPU-hungry apps (browsers with hardware acceleration, games)
- Use `Q4_K_M` as your default — don't go higher unless you test it fits
- Set context length to 4096-8192 (not 16K+) to save VRAM for KV cache
- Don't be discouraged — a well-tuned 8B RP model is genuinely good

### Tier 2: 16GB VRAM (RTX 4070 Ti, RTX 5080, RTX 3090, etc.)

**Your budget: 12-14B at Q4_K_M-Q5_K_M, or 8B at Q6_K**

This is the sweet spot tier. You have enough VRAM for models that are genuinely impressive at companion AI.

| Recommendation | Size | Why |
|---------------|------|-----|
| Sao10K Euryale 14B (Q4_K_M) | ~9 GB | Outstanding character consistency. Noticeable jump from 8B. |
| TheDrummer Anubis 14B (Q5_K_M) | ~11 GB | Excellent system prompt adherence. Rich responses. |
| Any top RP-tuned 22-24B (IQ4_XS) | ~13 GB | Tight fit but possible. Test VRAM usage before committing. |
| Aggressive: 70B RP (EXL2 2.5bpw) | ~14 GB | Requires ExLlamaV2 backend. Quality is remarkable for the compression level. |

**Tips for 16GB users:**
- Start with 14B Q4_K_M — it's the reliable choice
- If you want to experiment with 70B, try EXL2 2.5bpw formats (not GGUF — GGUF 70B won't fit at usable quality)
- You can comfortably run 8K-16K context at 14B
- Consider loading a small secondary model for utility tasks (see [Multi-Model Loading](#multi-model-loading-with-lm-studio-link))

### Tier 3: 32GB+ Unified RAM (M2 Pro/Max, M3 Pro/Max, M4 Pro/Max)

**Your budget: Up to 22-24B at Q4_K_M, or 70B at low quantization**

Apple Silicon's unified memory means your GPU and CPU share the same RAM pool. This lets you load much larger models than a discrete GPU with the same RAM, but generation speed is slower than NVIDIA GPUs.

| Recommendation | Size | Why |
|---------------|------|-----|
| Any top RP-tuned 14B (MLX int4) | ~9 GB | Fast and high quality. The comfortable choice. |
| RP-tuned 22-24B (MLX int4) | ~14 GB | Excellent quality, good speed on M3/M4 Pro. |
| 70B RP (MLX int4 or Q3_K_M) | ~28-35 GB | Fits in 36-48GB configs. Slow but the quality speaks for itself. |

**Tips for Apple Silicon users:**
- Use MLX format models when available — they're optimized for your hardware
- GGUF with Metal acceleration also works well in LM Studio
- Unified memory means the model never "spills" to CPU — it's all the same memory pool
- Generation speed scales with memory bandwidth, not compute cores. M3 Max > M3 Pro > M3.

---

## CPU Offloading Guide

CPU offloading lets you load a model that doesn't fully fit in your VRAM by putting some layers on system RAM (CPU) and the rest on your GPU. The GPU-resident layers run fast; the CPU-resident layers run slow. Overall speed depends on the ratio.

### When Is It Worth It?

**Worth it:**
- You need 5-10 more layers than your VRAM allows (offloading ~20-30% of layers)
- You have fast system RAM (DDR5 or better)
- You're okay with slower generation and mainly use text chat (not voice)
- The quality jump from the larger model justifies the speed loss

**Not worth it:**
- You'd need to offload more than 50% of layers to CPU — at that point you're basically running a CPU model with extra steps
- You need fast generation for voice conversations
- Your system RAM is DDR3 or slow DDR4
- The next smaller model size would fit entirely in VRAM — a fully GPU-resident smaller model usually beats a partially offloaded larger model in practice

### Speed Penalty by Hardware

| Layers Offloaded to CPU | DDR5-6000 System RAM | DDR4-3200 System RAM | DDR4-2400 System RAM |
|------------------------|---------------------|---------------------|---------------------|
| 10% of layers | ~15-20% slower | ~25-30% slower | ~35-40% slower |
| 25% of layers | ~35-45% slower | ~50-60% slower | ~65-75% slower |
| 50% of layers | ~60-70% slower | ~75-85% slower | ~85-90% slower |
| 75%+ of layers | ~80-90% slower | Effectively CPU-only | Effectively CPU-only |

### Practical Examples

**Example 1: RTX 3070 (8GB) trying to run a 14B Q4_K_M (~9 GB)**
- Need to offload ~15-20% of layers to CPU
- With DDR5 RAM: Expect ~25-35 tok/s → ~20-28 tok/s. Usable for text chat.
- Verdict: **Worth trying.** The quality jump from 8B to 14B is significant.

**Example 2: RTX 5080 (16GB) trying to run a 70B Q4_K_M (~42 GB)**
- Need to offload ~60-65% of layers to CPU
- Even with DDR5: Expect ~3-6 tok/s. Painful.
- Verdict: **Not worth it.** Use EXL2 2.5bpw instead (fits in VRAM), or stick with 14B-24B.

**Example 3: RTX 4060 Ti 16GB trying to run a 22B Q4_K_M (~14 GB)**
- Need to offload maybe ~10% of layers
- With DDR5: Barely any speed loss.
- Verdict: **Definitely worth it.** Minimal offload, big quality gain.

### How to Configure in LM Studio

In LM Studio's model loading settings, look for "GPU Offload" or "Number of layers to offload to GPU." Set this to the maximum number that fits in your VRAM. LM Studio will put the remaining layers on CPU automatically. Start high and reduce if you get out-of-memory errors.

---

## LM Studio Settings for RP

These settings live in two places: **model loading settings** (affect VRAM/speed) and **inference settings** (affect output quality).

### Loading Settings

| Setting | Recommended Value | Why |
|---------|------------------|-----|
| **Context Length** | 8192 (default), up to 16384 if VRAM allows | Longer context = more conversation history the model can "see." But it costs VRAM. 8K is fine for most chats. Bump to 16K for long sessions. |
| **GPU Layers** | Maximum that fits | Always offload as many layers to GPU as possible. More GPU layers = faster. |
| **Flash Attention** | Enabled | Reduces VRAM usage for the KV cache with no quality loss. Always enable this. |
| **Batch Size** | 512 (default) | Affects prompt processing speed (TTFT). Higher = faster prompt processing but more VRAM. Default is fine. |
| **RoPE Scaling** | Don't touch unless you know what you're doing | Incorrect RoPE settings can silently destroy model quality. Leave at model defaults. |

### Inference Settings (The Important Ones)

These control *how* the model generates text. Bad settings here can make even a great model produce garbage.

| Setting | Recommended for RP | What It Does |
|---------|-------------------|-------------|
| **Temperature** | 0.7 - 1.0 | Controls randomness. Lower = more predictable, higher = more creative. For RP, 0.8 is a good starting point. Go to 1.0 if responses feel repetitive. Drop to 0.7 if they feel incoherent. |
| **Top P** | 0.9 - 0.95 | Nucleus sampling. Limits the model to considering only the most probable tokens that sum to this percentage. 0.95 is safe. Lower values make output more focused. |
| **Top K** | 40 - 60 | Only consider the top K most likely next tokens. 40 is a common default. Set to 0 to disable (let Top P do the work alone). |
| **Min P** | 0.05 - 0.1 | Removes tokens below this probability threshold relative to the most likely token. Excellent for filtering out low-quality token choices without over-constraining creativity. Start at 0.05. |
| **Repetition Penalty** | 1.05 - 1.15 | Penalizes the model for repeating tokens it already said. Critical for RP — without this, models loop. 1.1 is a good default. Go higher if you see repetition, lower if responses feel "forced." |
| **Max Tokens** | 512 - 1024 | Maximum response length. 512 is good for conversational back-and-forth. 1024 for longer narrative responses. Don't set this too high or the model will ramble. |

### Settings to Leave Alone

| Setting | Leave At | Why |
|---------|---------|-----|
| **Frequency Penalty** | 0.0 | Overlaps with Repetition Penalty. Using both causes unnatural word avoidance. Pick one — Repetition Penalty is better for RP. |
| **Presence Penalty** | 0.0 | Same issue. Can cause the model to avoid mentioning important topics it already brought up. |
| **Mirostat** | Disabled | An alternative sampling method. Can work well but requires careful tuning. Stick with Temperature + Top P + Min P unless you want to experiment. |
| **TFS (Tail Free Sampling)** | 1.0 (disabled) | Another sampling method. Redundant with Min P. |

### My Go-To Settings Block

If you want a copy-paste starting point:

```
Temperature: 0.8
Top P: 0.95
Top K: 40
Min P: 0.05
Repetition Penalty: 1.1
Max Tokens: 768
```

Tweak from there based on how the model behaves.

---

## Benchmarks That Matter

Academic benchmarks (MMLU, HumanEval, etc.) measure things like trivia knowledge, coding ability, and grade-school math. They tell you almost nothing about whether a model is good at companion AI. A model can ace MMLU and still produce lifeless, robotic RP responses.

Here's what to actually look at:

### EQ-Bench 3

An emotional intelligence benchmark that tests whether models can understand and reason about emotions in complex scenarios. This is the closest academic benchmark to what companion AI actually requires. Models that score well on EQ-Bench tend to produce more emotionally aware and contextually appropriate responses.

**Where to find it:** Search for "EQ-Bench leaderboard" — results are publicly available.

### Community RP Rankings (Reddit, Discord)

The RP community on Reddit (`/r/LocalLLaMA`, `/r/SillyTavern`) and various Discord servers regularly runs informal but extensive model comparisons. These "vibes-based" evaluations are often more useful than formal benchmarks because they test exactly what you care about: character consistency, prose quality, emotional range, and instruction adherence in RP contexts.

**What to look for:** Threads comparing the latest RP fine-tunes, user experience reports, and "what are you running?" discussions. These communities collectively test more models more thoroughly than any benchmark suite.

### Your Own Testing

Ultimately, the best benchmark is loading the model and talking to your character for 30 minutes. Create a test scenario that exercises what you care about:

- Does the character maintain their voice and personality?
- Does the model remember details from earlier in the conversation?
- Do emotional beats land naturally or feel forced?
- Does the model produce varied responses, or does it fall into patterns?
- Can it handle unexpected inputs without breaking character?

A 10-minute conversation test will tell you more than any leaderboard.

### Warning: Misleading Benchmarks

| Benchmark | Why It's Misleading for RP |
|-----------|--------------------------|
| **MMLU** | Tests academic knowledge (history, science, law). A model that knows more trivia is not a better companion. |
| **HumanEval / MBPP** | Tests code generation. Completely irrelevant to RP. |
| **GSM8K** | Tests grade-school math. Your companion doesn't need to solve word problems. |
| **HellaSwag** | Tests common sense completion. Somewhat relevant but doesn't capture emotional intelligence or creative writing ability. |
| **Chatbot Arena** | Better than the above, but heavily biased toward "helpful assistant" behavior rather than creative/RP ability. Models that are great at RP sometimes score poorly because they don't give the "correct" answer to factual questions. |

---

## Multi-Model Loading with LM Studio Link

LM Studio Link exposes your locally running models as an OpenAI-compatible API. This means Waifu-RT3D can talk to your local models the same way it talks to cloud APIs — no special configuration needed.

But here's where it gets interesting: you can load **multiple models simultaneously** and route different tasks to different models.

### Why Would You Want Multiple Models?

Your AI companion does several distinct jobs:

1. **Conversation/RP** — Needs creativity, character consistency, emotional range
2. **Summarization** — Compressing conversation history for memory (needs accuracy, not creativity)
3. **Function Calling** — Detecting and executing tool use (needs instruction following, not prose)
4. **Greeting Generation** — Quick, context-aware openers (small model is fine)

A single 14B RP model does all of these acceptably. But you can get better results by routing tasks to specialized models:

### Example: Dual-Model Setup (16GB VRAM)

| Model | Size | Role | Why |
|-------|------|------|-----|
| RP-tuned 14B (Q4_K_M) | ~9 GB | Main conversation | Best RP quality that fits |
| Instruct 3B (Q4_K_M) | ~2.5 GB | Summarization, function calls | Fast, accurate, doesn't need creativity |

Total VRAM: ~11.5 GB. Leaves headroom for KV cache and the OS.

### Example: Single-Model Setup (8GB VRAM)

| Model | Size | Role | Why |
|-------|------|------|-----|
| RP-tuned 8B (Q4_K_M) | ~5.5 GB | Everything | One model to rule them all. Simpler is better when VRAM is tight. |

Don't try to load two models on 8GB. Use one good model for everything.

### Example: Power User Setup (24GB+ VRAM)

| Model | Size | Role | Why |
|-------|------|------|-----|
| RP-tuned 22-24B (Q4_K_M) | ~14 GB | Main conversation | Outstanding quality |
| Instruct 7B (Q4_K_M) | ~5.5 GB | Summarization, tools, greetings | Fast utility model |

### How to Configure in Waifu-RT3D

1. In LM Studio, load your model(s) and enable the local server (usually `http://localhost:1234`)
2. In Waifu-RT3D Settings, set the API endpoint to `http://localhost:1234/v1`
3. The model name will auto-populate from LM Studio
4. If running multiple models, you can configure different model names for different tasks in the advanced settings

### Tips for Multi-Model Loading

- **Check total VRAM** before loading a second model. LM Studio shows VRAM usage per model.
- **The RP model should get priority.** If you're tight on VRAM, give the RP model Q5_K_M and the utility model Q4_K_M (or use a smaller utility model).
- **Context length adds up.** Each loaded model reserves VRAM for its KV cache. Keep utility model context short (2048-4096).
- **You don't need this on day one.** Start with a single RP model. Multi-model is an optimization for when you want to squeeze out more performance.

---

## Quick Start Checklist

If you skimmed this whole guide (no judgment), here's the minimum viable path:

1. **Install LM Studio** from [lmstudio.ai](https://lmstudio.ai)
2. **Search for an RP-tuned model** from one of the creators listed above (Sao10K, NeverSleep, TheDrummer)
3. **Pick the right size** for your VRAM:
   - 8GB VRAM → 7-8B Q4_K_M
   - 16GB VRAM → 12-14B Q4_K_M
   - 32GB unified (Mac) → 14-22B MLX int4
4. **Download the GGUF version** (quantized by bartowski if available)
5. **Load it in LM Studio** with Flash Attention enabled
6. **Set inference settings:** Temperature 0.8, Top P 0.95, Min P 0.05, Repetition Penalty 1.1
7. **Start the LM Studio server**
8. **Point Waifu-RT3D** at `http://localhost:1234/v1`
9. **Chat with your companion** and tweak settings based on how it feels

Welcome to local AI. Your data stays on your machine, your GPU stays warm, and your companion is yours alone.
