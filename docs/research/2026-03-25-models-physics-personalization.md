# Research: Conversation/RP Models, Physics Simulation, On-Device Personalization

**Date:** 2026-03-25
**Purpose:** Evaluate local LLMs for companion roleplay, physics/cloth simulation for VRM avatars, and LoRA-based personalization feasibility on consumer hardware.
**Hardware targets:** Mac M2 Pro (24GB unified), Win RTX 5080 (16GB VRAM), Win RTX 3070 (8GB VRAM)

---

## Category 3: Conversation / Roleplay Quality Models

### VRAM Budget Reference (GGUF Quantization)

| Model Size | Q4_K_M | Q5_K_M | Q6_K | Q8_0 |
|-----------|--------|--------|------|------|
| 7-8B | ~5-6 GB | ~6-7 GB | ~7 GB | ~8-9 GB |
| 11-13B | ~8 GB | ~9 GB | ~10.5 GB | ~13 GB |
| 32-34B | ~20 GB | ~22 GB | ~24 GB | ~32 GB |
| 70B | ~40 GB | ~44 GB | ~50 GB | ~65 GB |

**Note:** Add 1-4 GB for KV cache depending on context length (4K-32K). M2 Pro 24GB unified memory can offload layers to CPU for larger models but with speed penalty.

### Tier 1: Best for Your Hardware (7B-13B, fits all 3 machines)

| Model | Params | Context | HuggingFace ID | VRAM (Q4_K_M) | RP Quality | Community Sentiment | License |
|-------|--------|---------|----------------|---------------|------------|-------------------|---------|
| **Fimbulvetr 11B v2** | 11B | 4K | `Sao10K/Fimbulvetr-11B-v2-GGUF` | ~7 GB | **A+** | Gold standard for RP at this size. Sao10K's finest. Extremely expressive, stays in character. | CC-BY-NC-4.0 |
| **MythoMax L2 13B** | 13B | 4K | `TheBloke/MythoMax-L2-13B-GGUF` | ~8 GB | **A** | 57K downloads, 228 likes. The classic RP workhorse. Reliable, great character voice consistency. Slightly dated (LLaMA 2 base). | Other (Llama 2) |
| **DreamGen Opus v1.2 8B** | 8B | 8K | `dreamgen/opus-v1.2-7b-gguf` / `LoneStriker/opus-v1.2-llama-3-8b-GGUF` | ~5 GB | **A** | Purpose-built for steerable story/RP. Excellent narrative pacing and scene control. Llama 3 base version recommended. | Apache 2.0 |
| **Psyfighter2 13B** | 13B | 4K | `KoboldAI/LLaMA2-13B-Psyfighter2-GGUF` | ~8 GB | **A-** | 1.4K downloads, 96 likes. KoboldAI's RP champion. Good emotional range, strong dialogue. LLaMA 2 base is aging. | Llama 2 |
| **MN Violet Lotus 12B** | 12B | 128K native | Community merges (Mistral Nemo based) | ~7 GB | **A** | High emotional intelligence, creative writing. Mistral Nemo base gives modern architecture + long context. Rising star in 2025-2026. | Apache 2.0 |
| **Lumimaid / Stheno 8B** | 8B | 8K-128K | Various Llama 3.1 finetunes by NeverSleep | ~5 GB | **A-** | Best "bang for VRAM" at 8B. Specifically tuned for companion/RP scenarios. Active community. | Llama 3.1 |

### Tier 2: Premium Quality (needs RTX 5080 or M2 Pro with CPU offload)

| Model | Params | Context | HuggingFace ID | VRAM (Q4_K_M) | RP Quality | Community Sentiment | License |
|-------|--------|---------|----------------|---------------|------------|-------------------|---------|
| **DreamGen Opus v1.4 70B** | 70B | 8K | `dreamgen/opus-v1.4-70b-llama3-gguf` | ~40 GB (CPU offload on M2 Pro) | **S** | Best steerable RP model period. Requires significant hardware. | Apache 2.0 |
| **Midnight Miqu 70B v1.5** | 70B | 32K | `mradermacher/Midnight-Miqu-70B-v1.5-GGUF` | ~40 GB | **S** | 3.8K downloads. Legendary uncensored merge. Based on leaked Mistral Medium weights (Miqu). Exceptional creative writing and character depth. | Other |
| **Euryale L3 70B v2.1** | 70B | 8K | `mradermacher/L3-70B-Euryale-v2.1-GGUF` | ~40 GB | **S-** | Sao10K's 70B masterpiece. More structured than Midnight Miqu but equally expressive. Llama 3 base. | CC-BY-NC-4.0 |
| **DreamGen Opus v1.2 34B** | 34B | 8K | `dreamgen/opus-v1-34b` (GGUF via community) | ~20 GB | **A+** | Sweet spot between quality and VRAM. Fits RTX 5080 at Q4. Excellent scene direction. | Apache 2.0 |

### Tier 3: Legacy / Declining Relevance

| Model | Params | Notes |
|-------|--------|-------|
| **WizardLM Uncensored 7B/13B** | 7-13B | Dated (LLaMA 1/2 base). Was pioneering but surpassed by Fimbulvetr, MythoMax. Still 14.6K+ downloads for 7B variant. |
| **Chronos Hermes 13B** | 13B | Good long-context RP (~16K tokens) but older architecture. |
| **Toppy 7B** | 7B | Decent Mistral 7B variant for RP but outclassed by Lumimaid/Stheno 8B on Llama 3. |
| **Dolphin 2.9.1 70B** | 70B | Great uncensored general model but not RP-specialized. |

### Recommended Configuration for Waifu-RT3D

| Machine | Recommended Model | Quant | VRAM Used | Speed |
|---------|------------------|-------|-----------|-------|
| **Mac M2 Pro (24GB)** | Fimbulvetr 11B v2 | Q5_K_M | ~9 GB | Fast (fully GPU) |
| **Mac M2 Pro (24GB)** | DreamGen Opus 34B | Q4_K_M | ~20 GB | Moderate (tight fit) |
| **RTX 5080 (16GB)** | Fimbulvetr 11B v2 | Q6_K | ~10.5 GB | Very fast |
| **RTX 5080 (16GB)** | MN Violet Lotus 12B | Q5_K_M | ~9 GB | Very fast + 128K ctx |
| **RTX 3070 (8GB)** | DreamGen Opus v1.2 8B | Q4_K_M | ~5 GB | Fast |
| **RTX 3070 (8GB)** | Lumimaid/Stheno 8B | Q4_K_M | ~5 GB | Fast |

### Key Takeaways

1. **Fimbulvetr 11B v2 is the consensus best RP model in the 7-13B range.** Sao10K's work is widely regarded as gold standard for character roleplay.
2. **DreamGen Opus offers unique "steerability"** -- you can control narrative direction, POV, pacing via special tokens. This is uniquely valuable for a companion app.
3. **Mistral Nemo 12B based models (Violet Lotus, etc.) are the new hotness** -- modern architecture, 128K native context, Apache 2.0 license.
4. **70B models are the quality ceiling** but only feasible on RTX 5080 with CPU offload or as cloud fallback. Midnight Miqu and Euryale are the community favorites.
5. **LLaMA 2 based models (MythoMax, Psyfighter, WizardLM) are aging out.** Still work fine but newer bases offer better instruction following and longer context.

---

## Category 4: Physics / Cloth Simulation

### Approach Comparison

| Approach | Type | Real-Time? | Quality | Integration w/ Three.js/VRM | Complexity | Status |
|----------|------|------------|---------|---------------------------|------------|--------|
| **VRM SpringBone (@pixiv/three-vrm-springbone)** | Traditional (Verlet) | Yes, 60fps+ | Good for hair/accessories | **Native** -- built into three-vrm v3.4.4 | Low | Production-ready |
| **VRM 1.0 SpringJoint** | Traditional (Verlet) | Yes, 60fps+ | Better constraint model | **Native** -- three-vrm supports both 0.x and 1.0 | Low | Production-ready |
| **Three.js Compute Shader Cloth** | Traditional (GPU) | Yes, 60fps | Good cloth draping | Medium -- WebGPU compute shaders (Feb 2026 article) | Medium | Experimental |
| **Verlet Integration Cloth (CPU)** | Traditional (CPU) | Yes, 30-60fps | Basic cloth | Easy -- existing Three.js implementations (RobertoLovece/Cloth) | Low-Medium | Proven |
| **HOOD (GNN Cloth)** | ML (Graph Neural Net) | ~30fps (GPU) | Excellent, physically realistic | **None** -- Python/CUDA only, no WebGL port exists | Very High | Research only |
| **PICA (3DGS + GNN)** | ML (Gaussian Splatting) | No (offline) | State-of-art rendering | None | Extreme | Research only |
| **LayersNet** | ML (Particle GNN) | ~15fps (GPU) | Multi-layer garments | None | Very High | Research only |
| **ContourCraft** | ML (GNN + intersection) | ~20fps (GPU) | Best multi-garment | None | Very High | Research only |

### VRM SpringBone Details (Recommended Path)

The `@pixiv/three-vrm-springbone` package (v3.4.4, actively maintained) provides:

- **VRM 0.x:** VRMSpringManager -- chain-based physics for hair, tails, ribbons, skirts
- **VRM 1.0:** VRM1SpringManager -- joint-based physics with improved constraint model
- **Algorithm:** Verlet integration with configurable stiffness, gravity, drag, collision spheres
- **Performance:** Negligible overhead -- designed for VTuber apps running at 60fps
- **Collision:** Sphere/capsule colliders for head, body -- prevents hair clipping
- **Parameters:** `stiffness` (0-1), `gravityPower`, `gravityDir`, `dragForce`, `hitRadius`
- **Delta time clamping:** Built-in 50ms max to prevent physics explosion on frame drops

### Recommended Implementation Strategy

```
Phase 1 (Now):    Use @pixiv/three-vrm-springbone as-is
                  - Hair, tail, ribbons, earrings already work
                  - Tune stiffness/gravity per character

Phase 2 (Later):  Add Verlet cloth for skirts/capes
                  - CPU Verlet on simple meshes (< 500 vertices)
                  - Pin vertices to skeleton bones
                  - Collision with capsule body approximation

Phase 3 (Future): WebGPU compute shader cloth
                  - Higher vertex count cloth (2K+ vertices)
                  - Requires WebGPU adoption (Chrome 113+)
                  - Not viable for all users yet

Skip:             Neural cloth (HOOD, LayersNet, etc.)
                  - No web runtime exists
                  - Would require ONNX/WebNN port (months of work)
                  - Overkill for companion app aesthetic
```

### Key Papers

| Paper | Year | Relevance |
|-------|------|-----------|
| [HOOD: Hierarchical Graphs for Generalized Modelling of Clothing Dynamics](https://hf.co/papers/2212.07242) | 2022 (CVPR 2023) | Best GNN cloth sim. Not web-portable. |
| [Towards Multi-Layered 3D Garments Animation](https://hf.co/papers/2305.10418) | 2023 | Multi-layer cloth. Research only. |
| [PICA: Physics-Integrated Clothed Avatar](https://hf.co/papers/2407.05324) | 2024 | 3DGS + GNN. Gorgeous but offline. |
| [Hybrid Neural-MPM for Interactive Fluid Simulations](https://hf.co/papers/2505.18926) | 2025 | Real-time neural physics. Could inspire future cloth work. |
| [SpringTime: Learning Simulatable Models of Cloth](https://arxiv.org/html/2507.21288) | 2025 | Learning-based spring parameters. Closest to VRM integration potential. |
| [Three.js Compute Shader Cloth (Medium)](https://medium.com/@pablobandinopla/simple-cloth-simulation-with-three-js-and-compute-shaders-on-skeletal-animated-meshes-acb679a70d9f) | Feb 2026 | Practical WebGPU cloth on skeletal meshes. Directly applicable. |

---

## Category 5: On-Device Personalization

### Method Comparison

| Method | VRAM Required | Training Time | Dataset Size | Quality Impact | Tools | Feasibility |
|--------|--------------|---------------|-------------|---------------|-------|-------------|
| **QLoRA (4-bit base + LoRA)** | **4-8 GB** | 30min-2hr (7B) | 100-1000 examples | High -- behavior/tone changes | Unsloth, PEFT, bitsandbytes | **RTX 3070: YES** |
| **LoRA (16-bit base)** | 10-20 GB (7B) | 20min-1hr (7B) | 100-1000 examples | Higher -- slightly better than QLoRA | Unsloth, PEFT | RTX 5080: YES, RTX 3070: NO (>8B) |
| **Full Fine-tuning** | 28+ GB (7B) | Hours | 1000+ examples | Highest | Standard PyTorch | None of your GPUs |
| **Prompt Tuning** | ~1 GB extra | 10-30min | 50-500 examples | Moderate -- soft prompts only | PEFT | **All machines** |
| **RAG (no training)** | 0 extra | Instant | Any | Facts/knowledge only, not behavior | LangChain, llama-index | **All machines** |
| **DoRA (Weight-Decomposed LoRA)** | 5-10 GB | 30min-2hr | 100-1000 examples | Higher than LoRA at same rank | Unsloth (2025+) | **RTX 3070: YES (QDoRA)** |
| **MixLoRA (LoRA + MoE)** | 8-16 GB | 1-3hr | 500-2000 examples | Very high -- multi-task | m-LoRA framework | RTX 5080: YES |

### QLoRA on Consumer Hardware: Detailed Breakdown

Based on the [RTX 4060 profiling study](https://arxiv.org/abs/2509.12229) (8GB VRAM, similar to RTX 3070):

| Config | Model | Rank | Batch | Seq Len | VRAM | Throughput |
|--------|-------|------|-------|---------|------|-----------|
| Minimal | Qwen2.5-1.5B | r=8 | 1 | 512 | ~4 GB | ~150 tok/s |
| Balanced | Qwen2.5-1.5B | r=16 | 2 | 1024 | ~6 GB | ~120 tok/s |
| Max Quality | Llama 3.1 8B | r=16 | 1 | 512 | ~7.5 GB | ~40 tok/s |
| Aggressive | Llama 3.1 8B | r=32 | 1 | 1024 | ~8 GB (tight) | ~25 tok/s |

### Recommended Personalization Strategy for Waifu-RT3D

```
Tier 1 - RAG (Implement Now, Zero Training):
  - Already have: User Knowledge Graph (C2), Tiered Episodic Memory (A3)
  - Add: conversation style extraction, preference vectors
  - Cost: 0 extra VRAM, instant "training"
  - Impact: Facts, preferences, relationship history

Tier 2 - QLoRA Personality Adapter (Medium effort):
  - Train character-specific LoRA adapters on user conversation history
  - Base: 8B model (Lumimaid/DreamGen Opus) with QLoRA r=16
  - Dataset: Extract 200-500 high-quality exchanges from chat history
  - VRAM: 7-8 GB training (RTX 3070 viable), 5 GB inference (adapter <50MB)
  - Schedule: Retrain weekly/on-demand in background
  - Tools: Unsloth + PEFT (Python, runs locally)
  - Impact: Character voice adapts to user's conversation style

Tier 3 - DoRA Multi-Adapter (Advanced):
  - One adapter per character personality facet (humor, empathy, formality)
  - Merge/swap adapters dynamically based on mood engine state
  - VRAM: 8-10 GB training, 5-6 GB inference (multiple small adapters)
  - Tools: Unsloth 2025+ with DoRA support
  - Impact: Nuanced personality adaptation

Skip: Full fine-tuning, MixLoRA (too much VRAM for marginal gains)
```

### 2025-2026 Best Practices

| Practice | Details |
|----------|---------|
| **Starting config** | r=16, alpha=32, DoRA=true, target_modules="all-linear" |
| **Rank sweet spot** | r=16 for personality, r=32-64 for complex behavior changes |
| **Don't overtrain** | Keep to < 0.5% of total params. More breaks the model. |
| **Hybrid approach** | RAG for facts, LoRA for behavior/tone -- consensus best practice for 2026 |
| **Dataset quality** | 200-500 curated examples > 5000 noisy ones |
| **Evaluation** | Compare perplexity on held-out user conversations |
| **Adapter size** | Typically 20-100 MB per LoRA adapter -- trivially storable |
| **Hot-swap** | LoRA adapters can be loaded/unloaded in <1 second via llama.cpp |

### Key Tools

| Tool | Purpose | Link |
|------|---------|------|
| **Unsloth** | 2x faster LoRA/QLoRA training, 70% less VRAM | [unsloth.ai](https://unsloth.ai) |
| **PEFT** | HuggingFace parameter-efficient fine-tuning library | [HF PEFT](https://github.com/huggingface/peft) |
| **Unsloth Studio** | No-code web UI for fine-tuning (2026) | [unsloth.ai](https://unsloth.ai) |
| **llama.cpp** | LoRA adapter loading at inference time | [ggerganov/llama.cpp](https://github.com/ggerganov/llama.cpp) |
| **LM Studio** | GUI for running GGUF models + LoRA adapters | [lmstudio.ai](https://lmstudio.ai) |

### Key Papers

| Paper | Year | Relevance |
|-------|------|-----------|
| [QLoRA: Efficient Finetuning of Quantized LLMs](https://hf.co/papers/2305.14314) | 2023 | Foundation paper. 60 upvotes. |
| [LoRA Land: 310 Fine-tuned LLMs that Rival GPT-4](https://hf.co/papers/2405.00732) | 2024 | 122 upvotes. Proves LoRA can match full FT. |
| [Profiling LoRA/QLoRA on Consumer GPUs](https://hf.co/papers/2509.12229) | 2025 | RTX 4060 case study. Directly applicable. |
| [QDyLoRA: Quantized Dynamic Low-Rank Adaptation](https://hf.co/papers/2402.10462) | 2024 | Dynamic rank selection. |
| [MixLoRA: LoRA + Mixture of Experts](https://hf.co/papers/2404.15159) | 2024 | Multi-task adaptation. Future potential. |

---

## Sources

### Category 3 (Roleplay Models)
- [Best AI RP & LLMs for Roleplay in 2026](https://nutstudio.imyfone.com/llm-tips/best-llm-for-roleplay/)
- [RTX 3060? Best Local LLM for Roleplay (2026)](https://aiinsightsnews.net/local-llm-for-roleplay/)
- [Top 2025 LM Studio Models for Roleplay](https://blog.techray.dev/the-best-lm-studio-models-for-roleplay-and-character-chats-2025)
- [OpenRouter Roleplay Rankings](https://openrouter.ai/rankings/roleplay)
- [Best 7B Models For AI Roleplay](https://techtactician.com/best-7b-llm-models-for-oobabooga-ai-roleplay-and-chatting/)
- [How Much VRAM for SillyTavern 2026](https://redstapler.co/how-much-vram-do-you-actually-need-for-sillytavern-in-2026/)
- [Miqu LLM Hardware Requirements](https://www.hardware-corner.net/llm-database/Miqu/)

### Category 4 (Physics/Cloth)
- [@pixiv/three-vrm-springbone npm](https://www.npmjs.com/package/@pixiv/three-vrm-springbone)
- [VRM Spring Bone Docs](https://vrm.dev/en/univrm/springbone/univrm_secondary/)
- [VRM4U Spring Bone Physics](https://deepwiki.com/ruyo/VRM4U/3.1-spring-bone-physics)
- [Three.js Compute Shader Cloth (Feb 2026)](https://medium.com/@pablobandinopla/simple-cloth-simulation-with-three-js-and-compute-shaders-on-skeletal-animated-meshes-acb679a70d9f)
- [HOOD Project Page](https://dolorousrtur.github.io/hood/)
- [UniVRM SpringBone System](https://deepwiki.com/vrm-c/UniVRM/4-springbone-physics-system)

### Category 4 Papers
- [HOOD: Hierarchical Graphs for Clothing Dynamics (CVPR 2023)](https://hf.co/papers/2212.07242)
- [PICA: Physics-Integrated Clothed Avatar](https://hf.co/papers/2407.05324)
- [LayersNet: Multi-Layered 3D Garments](https://hf.co/papers/2305.10418)
- [SpringTime: Learning Simulatable Cloth Models](https://arxiv.org/html/2507.21288)

### Category 5 (Personalization)
- [LoRA & QLoRA Complete Guide](https://letsdatascience.com/blog/fine-tuning-llms-with-lora-and-qlora-complete-guide)
- [RTX 4060 LoRA/QLoRA Profiling](https://arxiv.org/abs/2509.12229)
- [Fine-Tuning Infrastructure: LoRA, QLoRA, PEFT](https://introl.com/blog/fine-tuning-infrastructure-lora-qlora-peft-scale-guide-2025)
- [Unsloth Documentation](https://unsloth.ai/docs/get-started/fine-tuning-llms-guide)
- [QLoRA Fine-Tuning on Consumer GPU (Unsloth)](https://www.stack-junkie.com/blog/lora-fine-tuning-consumer-gpu)
- [NVIDIA RTX AI Garage: Unsloth Fine-Tuning](https://blogs.nvidia.com/blog/rtx-ai-garage-fine-tuning-unsloth-dgx-spark/)
- [Unsloth Studio: 70% VRAM Reduction](https://i10x.ai/news/unsloth-studio-local-llm-fine-tuning)
- [GGUF Quantization Guide 2025](https://local-ai-zone.github.io/guides/what-is-ai-quantization-q4-k-m-q8-gguf-guide-2025.html)
- [Ollama VRAM Requirements 2026](https://localllm.in/blog/ollama-vram-requirements-for-local-llms)
