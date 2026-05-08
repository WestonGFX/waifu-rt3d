# HuggingFace Model Hunt — Waifu-RT3D

**Date:** 2026-05-07  
**Researcher:** Claude Code (model hunt via WebSearch + WebFetch)  
**Purpose:** Identify candidate models for four subsystems: LoRA fine-tuning base, TTS voice, semantic embeddings, and VLM game spectator.  
**Methodology:** Checked official HF model cards, not just search snippets. Prioritized models released or significantly updated in 2024–2025.

---

## Summary Table

| Category | Top Pick | Runner-up | Budget Option |
|---|---|---|---|
| LoRA base | Qwen3-8B | Qwen2.5-14B-Instruct | Qwen2.5-7B-Instruct |
| TTS (English) | Kokoro-82M v1.0 (upgrade paths) | Chatterbox | Parler-TTS Mini v1 |
| TTS (Japanese) | Kokoro-82M v1.0 (jf_* voices) | Style-Bert-VITS2 JVNV | MeloTTS-Japanese |
| Embeddings | nomic-embed-text-v2-moe | mxbai-embed-large-v1 | nomic-embed-text-v1.5 |
| VLM / Spectator | Qwen3-VL-8B-Instruct | InternVL2.5-8B | SmolVLM2-2.2B / Moondream2 |

---

## Category 1: LoRA Fine-Tuning Base Models

**Requirement:** Roleplay/character dialogue, PEFT LoRA with `peft` library, RTX 5080 (16 GB VRAM) or M2 Pro, 7–14B range, instruct-tuned.

**VRAM rule of thumb:**
- QLoRA (4-bit base + LoRA adapters): 7B → ~8–10 GB, 14B → ~14–16 GB
- LoRA (bf16 base frozen + adapters): 8B → ~16 GB (tight fit on 5080), 14B → needs quantization
- The RTX 5080 at 16 GB is sufficient for QLoRA on any 7B–14B model and LoRA on 7–8B models

---

### 1. Qwen/Qwen3-8B

**HF path:** `Qwen/Qwen3-8B`  
**Params / disk:** 8.2B params / ~16 GB BF16 safetensors  
**License:** Apache 2.0 — commercial use OK  
**Context:** 32,768 native / 131,072 with YaRN  
**Downloads:** 10.9M/month (May 2026)

**Strengths for waifu-rt3d:**
- Released April 2025 — the most current Qwen generation
- Dual-mode thinking: `enable_thinking=True/False` in one model. Thinking mode adds chain-of-thought for complex emotional reasoning; non-thinking mode gives fast direct responses for typical chat
- Explicitly marketed as superior for "creative writing and role-playing, multi-turn dialogues"
- 275+ quantized variants available for inference at 4–8 GB (GGUF for LM Studio, Ollama, llama.cpp)
- Strong multilingual including Japanese (useful for anime character names/phrases)
- For LoRA fine-tuning: standard transformer architecture, fully compatible with `peft` library

**Weaknesses:**
- No pre-existing community roleplay LoRA adapters for Qwen3 yet (too new — April 2025)
- Thinking mode adds latency; must be disabled for low-latency chat
- Context for BF16 inference is right at the 16 GB VRAM edge — use Q8 GGUF (~9 GB) for comfortable fine-tuning headroom

**QLoRA fine-tuning on RTX 5080:** Feasible. 8B QLoRA fits in ~10 GB, leaving 6 GB headroom for optimizer states.

**Download:**
```python
from transformers import AutoModelForCausalLM, AutoTokenizer
model = AutoModelForCausalLM.from_pretrained("Qwen/Qwen3-8B", torch_dtype="auto", device_map="auto")
```

---

### 2. Qwen/Qwen2.5-14B-Instruct

**HF path:** `Qwen/Qwen2.5-14B-Instruct`  
**Params / disk:** 14.7B params / ~30 GB BF16 (requires quantization on 16 GB GPU)  
**License:** Apache 2.0 — commercial use OK  
**Context:** 131,072 tokens native (32,768 default config)  
**Downloads:** Very high — one of the most-downloaded Qwen variants

**Strengths:**
- Larger parameter count gives richer character persona depth and more consistent long-form roleplay
- Excellent instruction following, "enhanced condition-setting for chatbots" per model card
- 134 quantized versions — Q4_K_M GGUF runs at ~9 GB VRAM for inference; fits easily on 5080
- 1M context variant available: `Qwen/Qwen2.5-14B-Instruct-1M` (unique for long memory retrieval)
- Proven LoRA adapters in the community (e.g., `ngxson/LoRA-Qwen2.5-14B-Instruct-abliterated-v2`)
- 29+ languages including Japanese

**Weaknesses:**
- BF16 full precision does NOT fit in 16 GB — must use QLoRA (4-bit) for fine-tuning on 5080
- Qwen2.5 (Oct 2024) is one generation behind Qwen3 (Apr 2025)
- M2 Pro unified memory can handle it via `mlx-lm` but slowly

**QLoRA fine-tuning on RTX 5080:** QLoRA 4-bit base uses ~8 GB + ~2–3 GB for LoRA adapters = ~10–11 GB. Fits.

**Download:**
```python
model = AutoModelForCausalLM.from_pretrained("Qwen/Qwen2.5-14B-Instruct", torch_dtype="auto", device_map="auto")
```

---

### 3. meta-llama/Llama-3.1-8B-Instruct

**HF path:** `meta-llama/Llama-3.1-8B-Instruct`  
**Params / disk:** 8B params / 16.1 GB BF16 GGUF  
**License:** Llama 3.1 Community License — commercial use OK for products under 700M MAU  
**Context:** 128,000 tokens  
**Downloads:** 9.7M/month

**Strengths:**
- Industry-standard base model — the most documented for LoRA fine-tuning in 2024–2025
- Enormous ecosystem: 626+ quantized variants, extensive roleplay LoRA adapters (Stheno v3.2, etc.)
- 128K context is the largest native context in this tier
- Best-documented QLoRA recipes (Unsloth achieves 8–10 GB for fine-tuning)
- Excellent English prose quality for companion dialogue

**Weaknesses:**
- Llama 3.1 Community License has a "commercial use threshold" (>700M MAU requires Meta agreement) — not a concern for this app, but worth noting
- Weaker non-English (Japanese) than Qwen models
- Released July 2024 — Llama 3.2 (Sept 2024) and future versions exist but 3.1-8B remains the most fine-tuned base
- Slightly lower creative writing scores vs Qwen2.5/3 in direct comparisons

**QLoRA fine-tuning on RTX 5080:** Well-documented. BF16 LoRA fits exactly in 16 GB; QLoRA needs ~8–10 GB.

**Download:** Requires HF access agreement (free, just click "agree").
```bash
huggingface-cli download meta-llama/Llama-3.1-8B-Instruct
```

---

### 4. Qwen/Qwen2.5-7B-Instruct

**HF path:** `Qwen/Qwen2.5-7B-Instruct`  
**Params / disk:** 7.61B params / ~15.2 GB BF16  
**License:** Apache 2.0 — commercial use OK  
**Context:** 131,072 tokens (32,768 default)  
**Downloads:** Extremely high — one of the most popular 7B models

**Strengths:**
- Explicit "enhanced role-play implementation" on the model card
- Apache 2.0 — cleanest license, no usage thresholds
- Smaller than 14B variant, easier QLoRA fine-tuning
- Strong multilingual (29 languages) and Japanese support
- Community derivative: `HumanLLMs/Human-Like-Qwen2.5-7B-Instruct` — DPO-tuned for natural conversation

**Weaknesses:**
- Less character depth than 14B for long sessions
- Qwen2.5 (Oct 2024) vs Qwen3 (Apr 2025) — one generation older
- 7B models can struggle with consistent multi-turn persona maintenance over 50+ turns

**Best use case:** Budget machine (8 GB VRAM) or as a fast inference model alongside a separate VLM.

---

### 5. mistralai/Mistral-Nemo-Instruct-2407

**HF path:** `mistralai/Mistral-Nemo-Instruct-2407`  
**Params / disk:** 12B params / ~24 GB BF16 (quantization required for 16 GB)  
**License:** Apache 2.0 — commercial use OK  
**Context:** 128,000 tokens  
**Downloads:** Moderate

**Strengths:**
- 12B is a sweet spot between 7B quality and 14B size
- Apache 2.0, no MAU threshold
- Strong multilingual including Japanese/Chinese/Russian
- Function calling support built-in (useful for tool-use during chat)
- 164 quantized versions available

**Weaknesses:**
- 12B BF16 doesn't fit on 16 GB — must quantize for 5080
- Older architecture (July 2024) — Mistral has not released a notable 7–14B model since Nemo
- Less roleplay community fine-tuning vs Llama or Qwen
- Temperature must be kept low (0.3) per official docs — less creative by default

**Verdict:** Solid but overshadowed by Qwen3-8B for this use case.

---

### LoRA Base Model Recommendation

**Primary pick:** `Qwen/Qwen3-8B` — newest model (April 2025), Apache 2.0, built-in thinking mode useful for emotional reasoning, excellent roleplay alignment, fits QLoRA on 5080 with room to spare.

**Alternative:** `Qwen/Qwen2.5-14B-Instruct` for higher quality persona depth — use Q4 QLoRA to fit on 5080.

**If you need maximum ecosystem support:** `meta-llama/Llama-3.1-8B-Instruct` — more community LoRA adapters exist.

---

## Category 2: TTS Voice Models

**Requirement:** English + Japanese, small/fast, <4 GB VRAM or CPU-capable, voice cloning or description-driven generation. Already have Kokoro-82M; looking for upgrades or alternatives.

---

### 1. hexgrad/Kokoro-82M (v1.0 — current, with ONNX variants)

**HF path:** `hexgrad/Kokoro-82M` | ONNX: `onnx-community/Kokoro-82M-v1.0-ONNX`  
**Params / disk:** 82M params / 326 MB (fp32), 86 MB (q8f16 ONNX)  
**License:** Apache 2.0 — commercial use OK  
**Languages/voices:** 8 languages, 54 voices total:
  - American English: 20 voices (af_heart A-tier, af_bella A-tier)
  - British English: 8 voices
  - **Japanese: 5 voices** (jf_alpha, jf_gongitsune, jf_nezumi, jf_tebukuro, jm_kumo)
  - Mandarin Chinese: 8 voices
  - Spanish, French, Hindi, Italian, Portuguese

**Upgrade paths over what you already have (v0.19 → v1.0):**
- v1.0 (Jan 2025): 5x more languages (1 → 8), 5x more voices (10 → 54), including Japanese
- ONNX variants: fp32/fp16/q8/q4 — smallest is `model_q8f16.onnx` at **86 MB**, no perceptible quality loss
- MLX variants for M2 Pro: `mlx-community/Kokoro-82M-bf16` (575 MB), 4-bit (smallest for Apple)
- Token limit: 510 tokens max; best at 100–200 tokens

**What to upgrade to:**
- If on M2 Pro: switch to `mlx-community/Kokoro-82M-bf16` for native Apple Silicon inference
- If doing browser/JS: `onnx-community/Kokoro-82M-v1.0-ONNX` with `model_q8f16.onnx`
- If serving via backend Python: upgrade `pip install kokoro>=0.9.2` (picks up v1.0 weights automatically) and add `pip install misaki[ja]` for Japanese phoneme support

**Japanese quality note:** 4 female voices (jf_*) and 1 male. Anime-appropriate for generic Japanese female character voices. Not character-specific (no specific anime character voices baked in).

---

### 2. ResembleAI/chatterbox

**HF path:** `ResembleAI/chatterbox` | Turbo: `ResembleAI/chatterbox-turbo`  
**Params / disk:** 500M (standard) / 350M (turbo) — disk size not documented; ~1–2 GB estimated  
**License:** MIT — commercial use OK  
**Languages:** Standard = English; turbo = English only; multilingual fork exists (23 languages)

**Strengths:**
- **Zero-shot voice cloning** from a short reference audio clip — the primary differentiator from Kokoro
- Emotion exaggeration control (unique feature in open-source TTS)
- Turbo variant adds **paralinguistic tags**: `[laugh]`, `[cough]`, `[sigh]` — natural companion reactions
- Trained on 0.5M hours of cleaned audio
- Outperformed ElevenLabs in 63.75% of blind evaluations
- Built-in imperceptible Perth watermark (does not affect audio quality)
- Sub-200ms latency on production hardware

**Weaknesses:**
- English-only for the standard model (multilingual requires separate fork)
- No Japanese anime voice support
- Requires ~2–4 GB VRAM estimated (not officially documented)
- Built-in watermarking cannot be disabled (consider this for commercial products)

**Use case for waifu-rt3d:** Voice cloning from a user-provided audio sample for custom character voices. The `[laugh]` and `[sigh]` paralinguistic tags are directly useful for companion emotional reactions.

**Install:**
```bash
pip install chatterbox-tts
```

---

### 3. parler-tts/parler-tts-mini-v1

**HF path:** `parler-tts/parler-tts-mini-v1`  
**Params / disk:** 900M params / ~2–3 GB (F32 weights)  
**License:** Apache 2.0 — commercial use OK  
**Languages:** English only  
**Context:** 510 tokens (text + description combined)

**Strengths:**
- **Description-driven voice synthesis**: Control gender, pitch, speaking rate, tone, and background noise via free-text prompt (e.g., "A warm, slightly husky female voice, speaking at a moderate pace in a quiet room")
- 34 named speakers with distinct voice profiles
- ~46K downloads/month — active community
- 45K hours of training audio
- ~2–4 GB VRAM estimated — small enough to co-locate with other models

**Weaknesses:**
- English only — no Japanese support
- Quality is noticeably below Kokoro or Chatterbox for pure English TTS
- 900M params make it 10x larger than Kokoro for similar English quality
- No voice cloning (voice is controlled by text description, not audio reference)
- A mini model — the large variant (`parler-tts/parler-tts-large-v1`) is significantly better but larger

**Use case for waifu-rt3d:** Describing a character's voice in natural language for initial prototype voices before committing to a Chatterbox clone. Low friction to get a distinctive voice.

**Install:**
```bash
pip install git+https://github.com/huggingface/parler-tts.git
```

---

### 4. myshell-ai/MeloTTS-Japanese

**HF path:** `myshell-ai/MeloTTS-Japanese`  
**Params / disk:** Not documented on model card; based on VITS architecture likely 50–100 MB  
**License:** MIT — commercial use OK  
**Languages:** Japanese (native; English via separate `MeloTTS-English` model)

**Strengths:**
- **CPU real-time inference** — explicitly documented, runs without GPU
- Very fast synthesis speed
- Speed adjustable (0.5x to 2.0x)
- MIT license with no restrictions
- Based on VITS2 + Bert-VITS2 architecture — proven for Japanese quality

**Weaknesses:**
- Single speaker per model (one JP male voice in the base model)
- Voice quality is noticeably below Bert-VITS2 or Style-Bert-VITS2 for anime-style voices
- Not designed for multiple characters
- No emotion control

**Use case for waifu-rt3d:** A reliable CPU-only Japanese TTS fallback when GPU is busy with LLM inference. Zero VRAM cost.

**Install:**
```bash
pip install git+https://github.com/myshell-ai/MeloTTS.git
```

---

### 5. Style-Bert-VITS2 (litagin/style_bert_vits2_jvnv)

**HF path:** `litagin/style_bert_vits2_jvnv`  
**Params / disk:** ~300–500 MB per voice model (safetensors + config + style_vectors.npy)  
**License:** CC BY-SA 4.0 (from JVNV Corpus) — **commercial use permitted with attribution**  
**Languages:** Japanese (specialized)

**Strengths:**
- **7 emotion styles**: Angry, Disgust, Fear, Happy, Sad, Surprise, Neutral — directly useful for companion emotional states
- Style interpolation: blend emotions at runtime (e.g., 70% happy + 30% surprised)
- JP-Extra architecture specifically tuned for Japanese phoneme accuracy
- Pre-trained character-specific voices exist in the community (RikkaBotan models: cool, sweet, ASMR styles)
- Can fine-tune on 10–30 minutes of audio for a new character voice
- 94 HF Spaces using this model — very active

**Weaknesses:**
- AGPL v3 for the training codebase (the inference weights themselves have more permissive licenses depending on training data)
- More complex setup than Kokoro (requires eSpeak, phonemizer, style_vectors.npy)
- Slower than Kokoro — not real-time on CPU
- No English support in the JP-Extra variant

**Use case for waifu-rt3d:** Best option for high-quality, emotionally-expressive Japanese character voices. Particularly suited to the companion use case where voice emotion must match dialogue sentiment.

---

### TTS Recommendation

**English voices:** Stay on Kokoro-82M but upgrade to v1.0 weights + add `misaki[ja]` for Japanese. The ONNX q8f16 variant at 86 MB is the lowest-overhead option.

**Voice cloning (user custom voice):** Add Chatterbox as a secondary engine — it's the only MIT-licensed zero-shot voice cloner in this tier.

**Japanese anime voices:** Kokoro's 5 Japanese voices are adequate for generic use. For emotionally rich, character-specific Japanese voices, Style-Bert-VITS2 JVNV is the quality ceiling.

---

## Category 3: Embedding Models

**Requirement:** Semantic memory search upgrade from all-MiniLM-L6-v2 (384d, 512 ctx). Looking for 256–768d, GGUF or PyTorch, 512–2048 token context.

**Current baseline:** `sentence-transformers/all-MiniLM-L6-v2` — 384d, 512 ctx, 62.17 MTEB avg

---

### 1. nomic-ai/nomic-embed-text-v2-moe (RECOMMENDED)

**HF path:** `nomic-ai/nomic-embed-text-v2-moe` | GGUF: `nomic-ai/nomic-embed-text-v2-moe-GGUF`  
**Params / disk:** 475M total / 305M active (MoE, top-2 routing) / Q4_K_M GGUF = 328 MiB  
**License:** Apache 2.0 — commercial use OK  
**Embedding dimensions:** 768 (flexible down to 256 via Matryoshka)  
**Context:** 512 tokens  
**Released:** February 2025

**Strengths:**
- First MoE architecture embedding model — 305M active params but outperforms models 2x its full size
- 768d vectors with Matryoshka support: can reduce to 256d for storage savings with minimal quality loss
- 100+ languages — good for multilingual memory (character dialogue in Japanese/English mix)
- BEIR score 52.86 / MIRACL 65.80 — best-in-class for ~300M active parameter models
- Official GGUF provided by Nomic AI (not third party): Q4_K_M = 328 MiB, Q5_K_M = 354 MiB
- llama.cpp compatible, can use `--rope-scaling yarn` to extend context if needed

**Weaknesses:**
- MoE architecture slightly more complex to serve than standard transformers
- 512 token context matches current baseline — no improvement for very long memory chunks
- New (Feb 2025) — less battle-tested than v1.5

**vs current all-MiniLM-L6-v2:**
- Same context length (512 tokens)
- 2x the dimensions (768 vs 384)
- Far higher retrieval accuracy (BEIR 52.86 vs ~40 for MiniLM)
- Drop-in replacement via sentence-transformers

**Use with llama.cpp:**
```bash
./embedding -ngl 99 -m nomic-embed-text-v2-moe.Q4_K_M.gguf -c 512 \
  -p 'search_query: What did we talk about yesterday?'
```

---

### 2. mixedbread-ai/mxbai-embed-large-v1

**HF path:** `mixedbread-ai/mxbai-embed-large-v1` | GGUF: `ChristianAzinn/mxbai-embed-large-v1-gguf`  
**Params / disk:** 300M params / ~600 MB F16; GGUF Q4_K_M ~200 MB  
**License:** Apache 2.0 — commercial use OK  
**Embedding dimensions:** 1024 (Matryoshka, reducible to 512)  
**Context:** 512 tokens  
**MTEB avg:** 64.68 (SOTA for BERT-large class as of March 2024)

**Strengths:**
- SOTA for BERT-large sized models at release (March 2024)
- Beats OpenAI text-embedding-3-large (64.58) at a fraction of the cost
- 1024d vectors — highest density in this comparison (good for nuanced memory retrieval)
- Matryoshka: can reduce to 512d with minimal loss
- GGUF available (community conversion) — works with llama.cpp
- Strong STS score (85.00) — excellent for semantic similarity in memory retrieval

**Weaknesses:**
- Context still 512 tokens — same as MiniLM
- English-focused — weaker multilingual than nomic-embed-v2-moe
- GGUF is community-converted (not official) — verify compatibility
- 300M params slightly heavier than necessary for this use case

**Comparison vs nomic-embed-v2-moe:**
- mxbai has higher raw MTEB (64.68 vs ~62 for v2-moe)
- nomic-v2-moe is multilingual and official GGUF; mxbai is English-focused with community GGUF
- For English-only use: mxbai may edge out; for multilingual: nomic wins

---

### 3. nomic-ai/nomic-embed-text-v1.5 (current best GGUF-compatible)

**HF path:** `nomic-ai/nomic-embed-text-v1.5` | GGUF: `nomic-ai/nomic-embed-text-v1.5-GGUF`  
**Params / disk:** 100M params / Q4_K_M GGUF = 81 MiB, F16 = 262 MiB  
**License:** Apache 2.0 — commercial use OK  
**Embedding dimensions:** 768 (Matryoshka down to 64)  
**Context:** 2048 tokens (with RoPE YARN scaling), default 2048  
**MTEB avg:** 62.28

**Strengths:**
- **Smallest official GGUF at 81 MiB** (Q4_K_M) — lowest memory footprint
- **2048 token context** — 4x the context of MiniLM, best in this list for long memory chunks
- Matryoshka embeddings: 768 → 64 dimensions, useful for variable-density storage tiers
- Official GGUF by Nomic AI — llama.cpp compatible since Feb 2024
- Aligned with nomic-embed-vision-v1.5 for multimodal embeddings (future use)
- Task prefixes (`search_document:`, `search_query:`) improve retrieval quality

**Weaknesses:**
- Lower MTEB than mxbai or v2-moe
- 100M params vs 300M+ — slightly less expressive for nuanced semantic similarity
- Superseded by nomic-embed-text-v2-moe (Feb 2025) in quality

**Best use case:** Drop-in upgrade if you want maximum context length (2048 vs 512) and minimum disk footprint. Fits entirely in CPU RAM alongside the main LLM.

**llama.cpp with 8192 context (using RoPE YARN):**
```bash
./embedding -ngl 99 -m nomic-embed-text-v1.5.Q4_K_M.gguf -c 8192 -b 8192 \
  --rope-scaling yarn --rope-freq-scale .75 \
  -p 'search_document: The user said they love cats'
```

---

### 4. BAAI/bge-m3

**HF path:** `BAAI/bge-m3`  
**Params / disk:** ~560M params (XLM-RoBERTa-large architecture) / ~1.1 GB PyTorch  
**License:** MIT — commercial use OK  
**Embedding dimensions:** 1024  
**Context:** 8192 tokens  
**MTEB retrieval avg:** 72% — highest retrieval accuracy in this comparison

**Strengths:**
- **8192 token context** — best in class for long document embedding
- Triple-mode retrieval: dense + sparse + multi-vector (ColBERT) — can combine all three
- 100+ languages
- 72% retrieval accuracy — significantly outperforms others
- MIT license

**Weaknesses:**
- No GGUF available — PyTorch only; requires full model loaded in memory
- ~1.1 GB in memory — larger than nomic or mxbai
- More complex setup (FlagEmbedding library or sentence-transformers)
- Multi-vector mode requires ColBERT-style inference which is heavier

**Use case:** If the memory system grows to include very long documents (lore files, conversation history spanning thousands of tokens), bge-m3 is the clear upgrade path. For short-to-medium memory snippets (< 512 tokens), the overhead isn't justified.

---

### 5. BAAI/bge-small-en-v1.5 (honorable mention — smallest upgrade)

**HF path:** `BAAI/bge-small-en-v1.5`  
**Params / disk:** 33.4M params / ~135 MB PyTorch  
**License:** MIT — commercial use OK  
**Embedding dimensions:** 384  
**Context:** 512 tokens  
**MTEB avg:** 62.17

**Note:** Nearly identical MTEB to all-MiniLM-L6-v2 (62.17 vs ~60), same 384d, same 512 context. Minimal quality gain. Better retrieval scores in practice due to better normalization. Only worth switching to if you're seeing MiniLM recall issues — otherwise, skip directly to nomic-embed-v2-moe.

---

### Embedding Recommendation

**Primary upgrade:** `nomic-ai/nomic-embed-text-v2-moe` — official GGUF, Apache 2.0, multilingual, Q4_K_M at 328 MiB, Matryoshka 768→256d. Best balance of quality, language coverage, and ease of deployment for this stack.

**If context length matters (long memory chunks):** `nomic-ai/nomic-embed-text-v1.5` has 2048 token context at 81 MiB — drop it in first as a minimal-effort upgrade.

**If retrieval quality is the priority:** `BAAI/bge-m3` at 72% retrieval accuracy — but requires PyTorch, not GGUF.

---

## Category 4: Vision/VLM Models (Game Spectator)

**Requirement:** Analyze game screenshots for the spectator feature. Small enough to run alongside the chat LLM. Currently have `qwen/qwen3-vl-8b` available.

**Note:** The app already has `Qwen/Qwen3-VL-8B-Instruct` which is the top-tier option. This section evaluates whether a smaller model could handle screenshot analysis at lower VRAM cost, or whether Qwen3-VL-8B should remain the primary.

---

### 1. Qwen/Qwen3-VL-8B-Instruct (already available)

**HF path:** `Qwen/Qwen3-VL-8B-Instruct`  
**Params / disk:** 9B params / ~18 GB BF16  
**License:** Apache 2.0 — commercial use OK  
**Context:** 256K native / 1M extended  
**VRAM:** ~16 GB BF16; Q4 quantized ~5–6 GB

**Strengths:**
- Best-in-class GUI/screenshot analysis in the 8B range (released 2025)
- Native 256K context — can analyze multiple sequential screenshots in one call
- Explicit PC/Mobile GUI support: "recognizes UI elements, understands functions, invokes tools"
- Visual coding: can generate HTML/CSS/JS from screenshots
- 32 OCR languages (up from 19 in Qwen2.5-VL)
- Temporal video analysis — can process game video frame sequences

**Weaknesses:**
- 9B model at BF16 requires ~16–18 GB VRAM — leaves zero headroom on RTX 5080 alongside chat LLM
- Must use Q4 quantized for the spectator to co-exist with the chat LLM on the same GPU
- Q4 ScreenSpot score drops from 84.7% to ~75–80% (estimated)

**Recommended usage:** Use the quantized Q4 version (`Qwen/Qwen3-VL-8B-Instruct` via llama.cpp/LM Studio GGUF at ~5 GB) to free up VRAM for the chat LLM on the RTX 5080.

---

### 2. OpenGVLab/InternVL2_5-8B

**HF path:** `OpenGVLab/InternVL2_5-8B`  
**Params / disk:** 8B params / ~16–17 GB BF16; AWQ ~8–9 GB  
**License:** MIT — commercial use OK  
**Context:** 8192 tokens  
**Downloads:** 311,699/month

**Strengths:**
- MIT license — slightly more permissive than Apache 2.0
- Strong document/chart/OCR understanding
- Dynamic high-resolution processing (images split into 448×448 tiles, up to 12 tiles)
- Multi-image comparison in single inference
- AWQ 8-bit version at ~8–9 GB — co-existable with LLM on 5080 at higher quality than Q4

**Weaknesses:**
- 8K context vs Qwen3-VL-8B's 256K — significant limitation for sequential screenshot analysis
- InternLM2.5-7b-chat backbone may be less capable for game-specific reasoning than Qwen3
- InternVL2_5 (Dec 2024) is one generation behind vs Qwen3-VL (Apr 2025)
- 8 GB AWQ still tight alongside main LLM

**vs Qwen3-VL-8B:** InternVL2_5-8B performs similarly on OCR/document tasks but loses on GUI agent benchmarks (InternVL ScreenSpot ~78% vs Qwen3-VL 84.7%). The Qwen model is more capable for game UI analysis.

---

### 3. Qwen/Qwen2.5-VL-3B-Instruct

**HF path:** `Qwen/Qwen2.5-VL-3B-Instruct`  
**Params / disk:** 4B params / ~8 GB BF16  
**License:** Not specified on model card — inherits Qwen2.5 Apache 2.0 (verify before commercial use)  
**Context:** 32,768 tokens  
**VRAM:** ~8 GB BF16; Q4 ~2.5 GB

**Strengths:**
- AITZ_EM: 76.9%, AndroidWorld_SR: 90.8% — strong mobile GUI analysis at 3B
- Q4 quantized fits in ~2.5 GB VRAM — leaves 13+ GB for chat LLM on RTX 5080
- 32K context — sufficient for a series of screenshots
- ScreenSpot: 55.5% (weaker than 7B tier but adequate for game analysis)
- Significantly less VRAM overhead than any 7–9B model

**Weaknesses:**
- ScreenSpot 55.5% vs Qwen3-VL-8B's 84.7% — meaningful quality gap for game UI element identification
- 3B may miss subtle game state indicators
- Older generation (Oct 2024)

**Use case:** If the chat LLM needs maximum VRAM and the game spectator can tolerate lower analysis quality, Qwen2.5-VL-3B-Instruct is the lowest-overhead VLM with meaningful game UI understanding.

---

### 4. HuggingFaceTB/SmolVLM2-2.2B-Instruct

**HF path:** `HuggingFaceTB/SmolVLM2-2.2B-Instruct`  
**Params / disk:** 2.2B params / ~5 GB BF16  
**License:** Apache 2.0 — commercial use OK  
**Context:** Not documented; video inference uses ~5.2 GB GPU RAM  
**OCRBench:** 72.9

**Strengths:**
- Only **5.2 GB VRAM** for video inference — lowest-overhead option that handles multiple frames
- OCR/text extraction from images works well (72.9 OCRBench)
- Apache 2.0, HuggingFace official model
- Can run multi-image and video frame analysis
- 3–5x higher throughput vs 7B VLMs on same hardware

**Weaknesses:**
- GUI agent benchmarks not published — likely significantly worse than Qwen/InternVL on game UI element identification
- 2.2B limits reasoning depth for complex game state analysis
- Less tested for game spectator use cases

**Use case:** Screenshot captioning and scene description for context injection. Not ideal for precise game UI element identification, but excellent for "what is happening in this screenshot" general scene understanding.

---

### 5. moondream/moondream-2b-2025-04-14-4bit

**HF path:** `moondream/moondream-2b-2025-04-14-4bit`  
**Params / disk:** 1B params / ~2.5 GB  
**License:** Apache 2.0 — commercial use OK  
**Context:** Not documented  
**VRAM:** 2,450 MB on RTX 3090 at 184 tokens/second

**Strengths:**
- **Lowest VRAM of any viable option: 2.45 GB** — essentially free alongside the chat LLM
- 184 tokens/second — real-time game state analysis
- 42% memory reduction vs previous Moondream versions (quantization-aware training)
- Updated April 2025
- Clean API: `model.caption(image)`, `model.query(image, "question")`, `model.detect(image, "object")`
- Object detection built-in: find specific game elements by description

**Weaknesses:**
- 1B params — significantly less capable for complex game state reasoning
- No multi-image or video support
- Less OCR/text accuracy vs larger models
- Not designed for GUI agent tasks (no bounding box for clickable elements)

**Use case:** Best-in-class for the lowest VRAM budget. If the spectator only needs "what game is being played" and "what is on screen" (not precise UI element coordinates), Moondream2 is the most resource-efficient option.

---

### VLM Recommendation

The app already has `Qwen/Qwen3-VL-8B-Instruct` — this is the correct choice for the spectator. The only question is VRAM management:

| Scenario | Recommendation |
|---|---|
| RTX 5080 (16 GB), chat LLM + spectator on same GPU | Q4 GGUF of Qwen3-VL-8B (~5–6 GB) + Q4 chat LLM (~5–8 GB) = ~10–14 GB total |
| RTX 5080, want higher VLM quality | Use Qwen3-VL-8B AWQ 8-bit (~9 GB) and limit chat LLM to 7B Q4 |
| Dedicated spectator GPU or M2 Pro | Qwen3-VL-8B BF16 unquantized — full quality |
| Absolute minimum VRAM for spectator | Moondream2 (2.45 GB) or SmolVLM2-2.2B (5.2 GB) |

If a smaller dedicated spectator model is desired: **Qwen2.5-VL-3B-Instruct** is the recommended downgrade — same Qwen architecture, significantly lower VRAM, still meaningful GUI understanding.

---

## Files Referenced

During research, the following HuggingFace model cards were fetched:
- `hexgrad/Kokoro-82M` — voice list, v1.0 changelog
- `onnx-community/Kokoro-82M-v1.0-ONNX` — quantization variants and sizes
- `mlx-community/Kokoro-82M` collection — MLX variants
- `ResembleAI/chatterbox` and `chatterbox-turbo` — voice cloning specs
- `parler-tts/parler-tts-mini-v1` — description-driven TTS
- `myshell-ai/MeloTTS-Japanese` — Japanese TTS
- `litagin/style_bert_vits2_jvnv` — Japanese emotion TTS
- `Qwen/Qwen3-8B` — LoRA base candidate
- `Qwen/Qwen2.5-7B-Instruct` — LoRA base candidate
- `Qwen/Qwen2.5-14B-Instruct` — LoRA base candidate
- `Qwen/Qwen3-14B` — LoRA base candidate
- `meta-llama/Llama-3.1-8B-Instruct` — LoRA base candidate
- `mistralai/Mistral-Nemo-Instruct-2407` — LoRA base candidate
- `microsoft/phi-4` — LoRA base candidate (rejected: MIT but 16K context too short)
- `BAAI/bge-m3` — embedding candidate
- `BAAI/bge-small-en-v1.5` — embedding candidate
- `nomic-ai/nomic-embed-text-v1.5` and `v1.5-GGUF` — embedding candidate
- `nomic-ai/nomic-embed-text-v2-moe-GGUF` — embedding candidate
- `mixedbread-ai/mxbai-embed-large-v1` — embedding candidate
- `Qwen/Qwen3-VL-8B-Instruct` — VLM candidate
- `Qwen/Qwen2.5-VL-7B-Instruct` — VLM candidate
- `Qwen/Qwen2.5-VL-3B-Instruct` — VLM candidate
- `OpenGVLab/InternVL2_5-8B` — VLM candidate
- `HuggingFaceTB/SmolVLM2-2.2B-Instruct` — VLM candidate
- `moondream/moondream-2b-2025-04-14-4bit` — VLM candidate

---

## Actionable Next Steps

1. **Kokoro upgrade (low effort, today):** `pip install -U kokoro>=0.9.2 && pip install misaki[ja]` — unlocks 5 Japanese voices and 8 languages total. Zero model download needed.

2. **Embedding upgrade (low effort):** Replace `all-MiniLM-L6-v2` with `nomic-embed-text-v1.5` GGUF (81 MiB, 2048 ctx) or `nomic-embed-text-v2-moe` GGUF (328 MiB, 768d). Both are drop-in via sentence-transformers.

3. **LoRA fine-tuning (when ready):** Start with `Qwen/Qwen3-8B` + Unsloth QLoRA. Unsloth halves VRAM usage during fine-tuning and provides ready-made Qwen3 training notebooks.

4. **Voice cloning (user request feature):** Add `chatterbox-tts` as a secondary TTS engine. Keep Kokoro as the primary; invoke Chatterbox only when user provides a voice reference clip.

5. **Game spectator:** Already have the best model (`Qwen/Qwen3-VL-8B-Instruct`). Focus on GGUF quantization to reduce VRAM from ~18 GB to ~5–6 GB so it can co-exist with the chat LLM.

---

## Sources

- [hexgrad/Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M)
- [onnx-community/Kokoro-82M-v1.0-ONNX](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX)
- [Kokoro TTS MLX Collection](https://huggingface.co/collections/mlx-community/kokoro-tts)
- [ResembleAI/chatterbox](https://huggingface.co/ResembleAI/chatterbox)
- [ResembleAI/chatterbox-turbo](https://huggingface.co/ResembleAI/chatterbox-turbo)
- [parler-tts/parler-tts-mini-v1](https://huggingface.co/parler-tts/parler-tts-mini-v1)
- [myshell-ai/MeloTTS-Japanese](https://huggingface.co/myshell-ai/MeloTTS-Japanese)
- [litagin/style_bert_vits2_jvnv](https://huggingface.co/litagin/style_bert_vits2_jvnv)
- [Qwen/Qwen3-8B](https://huggingface.co/Qwen/Qwen3-8B)
- [Qwen/Qwen3-14B](https://huggingface.co/Qwen/Qwen3-14B)
- [Qwen/Qwen2.5-7B-Instruct](https://huggingface.co/Qwen/Qwen2.5-7B-Instruct)
- [Qwen/Qwen2.5-14B-Instruct](https://huggingface.co/Qwen/Qwen2.5-14B-Instruct)
- [meta-llama/Llama-3.1-8B-Instruct](https://huggingface.co/meta-llama/Llama-3.1-8B-Instruct)
- [mistralai/Mistral-Nemo-Instruct-2407](https://huggingface.co/mistralai/Mistral-Nemo-Instruct-2407)
- [microsoft/phi-4](https://huggingface.co/microsoft/phi-4)
- [BAAI/bge-m3](https://huggingface.co/BAAI/bge-m3)
- [BAAI/bge-small-en-v1.5](https://huggingface.co/BAAI/bge-small-en-v1.5)
- [nomic-ai/nomic-embed-text-v1.5-GGUF](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF)
- [nomic-ai/nomic-embed-text-v2-moe-GGUF](https://huggingface.co/nomic-ai/nomic-embed-text-v2-moe-GGUF)
- [mixedbread-ai/mxbai-embed-large-v1](https://huggingface.co/mixedbread-ai/mxbai-embed-large-v1)
- [Qwen/Qwen3-VL-8B-Instruct](https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct)
- [Qwen/Qwen2.5-VL-7B-Instruct](https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct)
- [Qwen/Qwen2.5-VL-3B-Instruct](https://huggingface.co/Qwen/Qwen2.5-VL-3B-Instruct)
- [OpenGVLab/InternVL2_5-8B](https://huggingface.co/OpenGVLab/InternVL2_5-8B)
- [HuggingFaceTB/SmolVLM2-2.2B-Instruct](https://huggingface.co/HuggingFaceTB/SmolVLM2-2.2B-Instruct)
- [moondream/moondream-2b-2025-04-14-4bit](https://huggingface.co/moondream/moondream-2b-2025-04-14-4bit)
- [HuggingFace VLMs 2025 blog](https://huggingface.co/blog/vlms-2025)
- [SmolVLM blog post](https://huggingface.co/blog/smolvlm)
- [Resemble AI Chatterbox](https://www.resemble.ai/chatterbox/)
- [Style-Bert-VITS2 GitHub](https://github.com/litagin02/Style-Bert-VITS2)
