# LM Studio Status — 2026-05-07

**Host:** 10.0.0.17:1234  
**Backend connection:** ✅ connected (via `openai` provider)

## Currently Loaded

| Model | Type | Quant | Context |
|-------|------|-------|---------|
| `qwen/qwen3.5-9b` | VLM | Q4_K_M | 207,016 tokens |

Capabilities: `tool_use`. Vision enabled. Thinking mode enabled in backend config.

## Available (Not Loaded)

| Model | Type | Quant | Max Context | Notes |
|-------|------|-------|-------------|-------|
| `gemma-4-26b-a4b-it-abliterated` | LLM | Q4_K_S | 262k | Large, uncensored, tool_use |
| `llama-3.2-8x4b-moe-v2-dark-champion-instruct-uncensored-abliterated-21b` | LLM | Q4_K_S | 131k | MoE, uncensored |
| `dirty-muse-writer-v01-uncensored-erotica-nsfw-i1` | LLM | Q4_K_S | 8192 | Very small ctx, NSFW writing |
| `text-embedding-nomic-embed-text-v1.5` | Embeddings | Q4_K_M | 2048 | Not loaded — backend uses minilm |
| `embeddinggemma-300m-qat-q8_0-unquantized` | LLM | MLX | 2048 | MLX format (Mac-only) |
| `zai-org/glm-4.6v-flash` | VLM | Q4_K_M | 131k | Vision, tool_use |
| `qwen2.5-0.5b-instruct-mlx` | LLM | MLX 4bit | 32k | Tiny, fast |
| `llama-3.2-1b-instruct` | LLM | Q8_0 | 131k | Tiny |
| `qwen2.5-0.5b-instruct` | LLM | Q8_0 | 32k | Tiny |
| `qwen/qwen3-vl-8b` | VLM | Q8_0 | 262k | Vision, large quant |
| `deepseek/deepseek-r1-0528-qwen3-8b` | LLM | Q4_K_M | 131k | Latest DeepSeek R1 thinking model |
| `deepseek-r1-distill-qwen-7b-uncensored-i1` | LLM | Q4_K_M | 131k | Uncensored R1 distill |
| `openai/gpt-oss-20b` | LLM | MXFP4 | 131k | OpenAI OSS 20B |

## Backend Config Summary

| Setting | Value |
|---------|-------|
| Active model | `qwen/qwen3.5-9b` |
| Endpoint | `http://10.0.0.17:1234/v1` |
| Embeddings | `minilm` (internal — nomic not loaded) |
| TTS | ElevenLabs, voice `af_claire` |
| Vision | Enabled |
| Thinking mode | Enabled |
| Link routing | Enabled (auto) |
| Backend RAM | 737.6 MB |
| DB size | 4.26 MB |

## Observations & Recommendations

1. **`deepseek-r1-0528-qwen3-8b`** — newest R1 variant (May 2028 release), would be a strong upgrade over Qwen3.5 for roleplay quality. Same context (131k). Worth A/B testing.
2. **`gemma-4-26b`** — 3x the parameters, abliterated. Would significantly improve character depth but uses more VRAM. Good candidate for "quality mode" switch.
3. **`text-embedding-nomic-embed-text-v1.5`** — not loaded but available. Backend uses `minilm` for embeddings. Nomic would improve semantic memory search quality (768d vs 384d). Consider enabling.
4. **`dirty-muse-writer-v01`** — 8192 token context is too small for companion use. Not recommended.
5. **`openai/gpt-oss-20b`** — interesting model, MXFP4 format. Worth testing if VRAM permits.
6. **`zai-org/glm-4.6v-flash`** — alternative VLM option, Chinese origin, 131k ctx.

