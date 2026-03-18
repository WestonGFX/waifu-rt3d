/**
 * Recommended Models Service
 *
 * Provides curated recommendations for LLM and TTS models optimized for anime roleplay.
 * Includes quality ratings, hardware requirements, and helper functions for filtering.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface QualityRatings {
  /** Creative writing ability (1-10) */
  creativeWriting: number;
  /** Character voice consistency and personality (1-10) */
  characterVoice: number;
  /** Instruction following and coherence (1-10) */
  instructionFollowing: number;
  /** Immersion and roleplay engagement (1-10) */
  roleplayImmersion: number;
}

export interface VRAMRequirements {
  /** VRAM needed at Q4 quantization (e.g., "6GB") */
  q4: string;
  /** VRAM needed at Q5 quantization (e.g., "8GB") */
  q5: string;
  /** VRAM needed at Q8 quantization (e.g., "12GB") */
  q8: string;
  /** VRAM needed at FP16 (full precision) */
  fp16: string;
}

export type SpeedTier = 'very-fast' | 'fast' | 'medium' | 'slow';
export type ModelProvider = 'ollama' | 'openrouter' | 'local' | 'api';

/**
 * Content maturity rating for model recommendations.
 *   - 'general'  – Safe for all users, no explicit content
 *   - 'edgy'     – Uncensored but not explicitly NSFW (dark themes, violence, etc.)
 *   - 'mature'   – Explicitly trained for or capable of NSFW/adult content
 */
export type ContentRating = 'general' | 'edgy' | 'mature';

export interface RecommendedLLMModel {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Ollama model ID (e.g., "lumimaid") */
  ollamaId?: string;
  /** OpenRouter model ID */
  openRouterId?: string;
  /** Provider type */
  provider: ModelProvider;
  /** Parameter count in billions (e.g., 8, 13, 70) */
  parameterCount: number;
  /** Max context window size */
  contextWindow: number;
  /** VRAM requirements at different quantization levels */
  vramRequirements: VRAMRequirements;
  /** Whether model is uncensored/unrestricted */
  isUncensored: boolean;

  /** Content maturity rating for filtering in the UI */
  contentRating: ContentRating;
  /** Quality ratings across different dimensions */
  qualityRatings: QualityRatings;
  /** Inference speed tier */
  speedTier: SpeedTier;
  /** License type */
  license: string;
  /** Descriptive tags */
  tags: string[];
  /** Brief description */
  description: string;
  /** Ollama pull command (e.g., "ollama pull lumimaid") */
  pullCommand?: string;
}

export interface RecommendedTTSModel {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Model type */
  type: 'local' | 'cloud';
  /** Quality rating (1-10) */
  qualityRating: number;
  /** Approximate latency */
  latency: string;
  /** Supports voice cloning/customization */
  hasVoiceCloning: boolean;
  /** Supported languages */
  languages: string[];
  /** VRAM requirement if local */
  vramRequirement: string;
  /** License type */
  license: string;
  /** Repository/homepage URL */
  repoUrl?: string;
  /** Brief description */
  description: string;
  /** Descriptive tags */
  tags: string[];
  /** What this model is best used for */
  bestFor: string;
}

// ============================================================================
// RECOMMENDED LLM MODELS
// ============================================================================

export const RECOMMENDED_LLM_MODELS: RecommendedLLMModel[] = [
  // Tier-1: Top picks for anime roleplay
  {
    id: 'lumimaid-8b',
    name: 'Lumimaid 8B',
    ollamaId: 'lumimaid',
    provider: 'ollama',
    parameterCount: 8,
    contextWindow: 32768,
    isUncensored: true,
    contentRating: 'edgy',
    qualityRatings: {
      creativeWriting: 9,
      characterVoice: 10,
      instructionFollowing: 8,
      roleplayImmersion: 10,
    },
    speedTier: 'very-fast',
    vramRequirements: {
      q4: '6GB',
      q5: '8GB',
      q8: '11GB',
      fp16: '16GB',
    },
    license: 'OpenRAIL-M',
    tags: ['anime', 'roleplay', 'top-pick', 'uncensored', 'fast'],
    description:
      'Top choice for anime roleplay. Specialized for character interaction with excellent personality consistency and creative writing. Fast inference with quality output.',
    pullCommand: 'ollama pull lumimaid',
  },

  {
    id: 'mn-violet-lotus-12b',
    name: 'MN-Violet-Lotus 12B',
    provider: 'ollama',
    parameterCount: 12,
    contextWindow: 32768,
    isUncensored: true,
    contentRating: 'edgy',
    qualityRatings: {
      creativeWriting: 10,
      characterVoice: 9,
      instructionFollowing: 9,
      roleplayImmersion: 9,
    },
    speedTier: 'fast',
    vramRequirements: {
      q4: '8GB',
      q5: '11GB',
      q8: '16GB',
      fp16: '24GB',
    },
    license: 'OpenRAIL-M',
    tags: ['anime', 'creative', 'top-pick', 'uncensored', 'high-quality'],
    description:
      'Top choice for creative writing. Excels at vivid descriptions and character development. Slightly larger model with superior creative capabilities.',
    pullCommand: 'ollama pull mn-violet-lotus',
  },

  // Tier-2: Strong alternatives
  {
    id: 'mag-mell-r1-12b',
    name: 'Mag Mell R1 12B',
    provider: 'ollama',
    parameterCount: 12,
    contextWindow: 32768,
    isUncensored: true,
    contentRating: 'edgy',
    qualityRatings: {
      creativeWriting: 9,
      characterVoice: 9,
      instructionFollowing: 9,
      roleplayImmersion: 9,
    },
    speedTier: 'fast',
    vramRequirements: {
      q4: '8GB',
      q5: '11GB',
      q8: '16GB',
      fp16: '24GB',
    },
    license: 'OpenRAIL-M',
    tags: ['anime', 'roleplay', 'uncensored', 'balanced'],
    description:
      'Well-rounded model with strong performance across all dimensions. Excellent balance of speed, quality, and character consistency.',
    pullCommand: 'ollama pull mag-mell-r1',
  },

  {
    id: 'natsumura-rp-8b',
    name: 'Natsumura RP 8B',
    provider: 'ollama',
    parameterCount: 8,
    contextWindow: 32768,
    isUncensored: true,
    contentRating: 'edgy',
    qualityRatings: {
      creativeWriting: 8,
      characterVoice: 9,
      instructionFollowing: 8,
      roleplayImmersion: 9,
    },
    speedTier: 'very-fast',
    vramRequirements: {
      q4: '6GB',
      q5: '8GB',
      q8: '11GB',
      fp16: '16GB',
    },
    license: 'OpenRAIL-M',
    tags: ['anime', 'roleplay', 'uncensored', 'fast', 'japanese'],
    description:
      'Specialized for roleplay with excellent character voice. Optimized for anime-style interactions. Lightweight and fast.',
    pullCommand: 'ollama pull natsumura-rp',
  },

  {
    id: 'mythomax-l2-13b',
    name: 'MythoMax-L2-13B',
    provider: 'ollama',
    parameterCount: 13,
    contextWindow: 32768,
    isUncensored: true,
    contentRating: 'edgy',
    qualityRatings: {
      creativeWriting: 9,
      characterVoice: 8,
      instructionFollowing: 9,
      roleplayImmersion: 8,
    },
    speedTier: 'fast',
    vramRequirements: {
      q4: '8GB',
      q5: '11GB',
      q8: '16GB',
      fp16: '26GB',
    },
    license: 'OpenRAIL-M',
    tags: ['creative', 'storytelling', 'uncensored', 'high-quality'],
    description:
      'Excellent for creative storytelling and narrative generation. Strong instruction following and coherence.',
    pullCommand: 'ollama pull mythomax-l2',
  },

  // Tier-3: Quality alternatives
  {
    id: 'lexi-uncensored-8b',
    name: 'Lexi Uncensored 8B',
    provider: 'ollama',
    parameterCount: 8,
    contextWindow: 16384,
    isUncensored: true,
    contentRating: 'edgy',
    qualityRatings: {
      creativeWriting: 8,
      characterVoice: 8,
      instructionFollowing: 8,
      roleplayImmersion: 8,
    },
    speedTier: 'very-fast',
    vramRequirements: {
      q4: '6GB',
      q5: '8GB',
      q8: '11GB',
      fp16: '16GB',
    },
    license: 'OpenRAIL-M',
    tags: ['uncensored', 'compact', 'fast', 'general'],
    description: 'Lightweight uncensored model with good general-purpose performance and fast inference.',
    pullCommand: 'ollama pull lexi-uncensored',
  },

  {
    id: 'dolphin-mistral-7b',
    name: 'Dolphin Mistral 7B',
    provider: 'ollama',
    parameterCount: 7,
    contextWindow: 32768,
    isUncensored: true,
    contentRating: 'edgy',
    qualityRatings: {
      creativeWriting: 7,
      characterVoice: 7,
      instructionFollowing: 9,
      roleplayImmersion: 7,
    },
    speedTier: 'very-fast',
    vramRequirements: {
      q4: '4GB',
      q5: '6GB',
      q8: '9GB',
      fp16: '14GB',
    },
    license: 'Apache 2.0',
    tags: ['uncensored', 'small', 'fast', 'instruction-following'],
    description:
      'Compact and fast model based on Mistral. Good for lower-end hardware with decent instruction following.',
    pullCommand: 'ollama pull dolphin-mistral',
  },

  {
    id: 'nous-hermes-3-8b',
    name: 'Nous Hermes 3 8B',
    provider: 'ollama',
    parameterCount: 8,
    contextWindow: 32768,
    isUncensored: false,
    contentRating: 'general',
      qualityRatings: {
      creativeWriting: 7,
      characterVoice: 7,
      instructionFollowing: 9,
      roleplayImmersion: 7,
    },
    speedTier: 'very-fast',
    vramRequirements: {
      q4: '6GB',
      q5: '8GB',
      q8: '11GB',
      fp16: '16GB',
    },
    license: 'MIT',
    tags: ['instruction-following', 'fast', 'open-source'],
    description:
      'Strong instruction-following capabilities with good reasoning. Widely available and reliable.',
    pullCommand: 'ollama pull nous-hermes-3',
  },

  {
    id: 'qwen-2-5-7b-uncensored',
    name: 'Qwen 2.5 7B Uncensored',
    provider: 'ollama',
    parameterCount: 7,
    contextWindow: 32768,
    isUncensored: true,
    contentRating: 'edgy',
    qualityRatings: {
      creativeWriting: 7,
      characterVoice: 7,
      instructionFollowing: 8,
      roleplayImmersion: 7,
    },
    speedTier: 'very-fast',
    vramRequirements: {
      q4: '4GB',
      q5: '6GB',
      q8: '9GB',
      fp16: '14GB',
    },
    license: 'Qwen License',
    tags: ['uncensored', 'small', 'multilingual', 'fast'],
    description:
      'Compact uncensored model with multilingual support. Excellent performance-to-size ratio.',
    pullCommand: 'ollama pull qwen2.5-7b-uncensored',
  },

  {
    id: 'gemma-2-9b-abliterated',
    name: 'Gemma 2 9B Abliterated',
    provider: 'ollama',
    parameterCount: 9,
    contextWindow: 16384,
    isUncensored: true,
    contentRating: 'edgy',
    qualityRatings: {
      creativeWriting: 7,
      characterVoice: 7,
      instructionFollowing: 8,
      roleplayImmersion: 7,
    },
    speedTier: 'very-fast',
    vramRequirements: {
      q4: '6GB',
      q5: '8GB',
      q8: '11GB',
      fp16: '18GB',
    },
    license: 'Gemma Terms',
    tags: ['uncensored', 'abliterated', 'fast', 'general'],
    description:
      'Google Gemma 2 with refusal mechanisms removed. Good balance of performance and efficiency.',
    pullCommand: 'ollama pull gemma2-9b-abliterated',
  },

  // Cloud options via OpenRouter
  {
    id: 'lumimaid-70b-openrouter',
    name: 'Lumimaid 70B (OpenRouter)',
    openRouterId: 'jondurbin/lumimaid-70b',
    provider: 'openrouter',
    parameterCount: 70,
    contextWindow: 32768,
    isUncensored: true,
    contentRating: 'general',
      qualityRatings: {
      creativeWriting: 10,
      characterVoice: 10,
      instructionFollowing: 9,
      roleplayImmersion: 10,
    },
    speedTier: 'medium',
    vramRequirements: {
      q4: 'N/A (Cloud)',
      q5: 'N/A (Cloud)',
      q8: 'N/A (Cloud)',
      fp16: 'N/A (Cloud)',
    },
    license: 'OpenRAIL-M',
    tags: ['anime', 'roleplay', 'cloud', 'large', 'top-quality', 'openrouter'],
    description:
      'Largest available model specialized for anime roleplay. Premium quality via cloud API. Use with OpenRouter account.',
  },

  {
    id: 'mn-celeste-12b-openrouter',
    name: 'MN-Celeste 12B (OpenRouter)',
    openRouterId: 'mncai/mn-celeste-12b',
    provider: 'openrouter',
    parameterCount: 12,
    contextWindow: 32768,
    isUncensored: true,
    contentRating: 'edgy',
    qualityRatings: {
      creativeWriting: 9,
      characterVoice: 9,
      instructionFollowing: 8,
      roleplayImmersion: 9,
    },
    speedTier: 'fast',
    vramRequirements: {
      q4: 'N/A (Cloud)',
      q5: 'N/A (Cloud)',
      q8: 'N/A (Cloud)',
      fp16: 'N/A (Cloud)',
    },
    license: 'OpenRAIL-M',
    tags: ['anime', 'creative', 'cloud', 'openrouter', 'uncensored'],
    description:
      'Excellent balance of creative writing and roleplay capability via cloud. Access through OpenRouter.',
  },

  // ── Edgy / Conversational / NSFW / Anime-Girl-Chat Focused ──────────────

  {
    id: 'noromaid-20b',
    name: 'Noromaid 20B v0.1.1',
    ollamaId: 'noromaid:20b',
    provider: 'ollama',
    parameterCount: 20,
    contextWindow: 4096,
    isUncensored: true,
    contentRating: 'mature',
    qualityRatings: {
      creativeWriting: 9,
      characterVoice: 9,
      instructionFollowing: 7,
      roleplayImmersion: 10,
    },
    speedTier: 'medium',
    vramRequirements: { q4: '12GB', q5: '14GB', q8: '22GB', fp16: '40GB' },
    license: 'Llama 2 Community',
    tags: ['nsfw', 'anime', 'waifu', 'edgy', 'uncensored', 'roleplay', 'mature'],
    description:
      'One of the OG anime RP models. Exceptional at maintaining flirty, affectionate, and emotionally nuanced character voices. A merge by IkariDev & Undi designed specifically for immersive companion chat.',
    pullCommand: 'ollama pull noromaid:20b',
  },
  {
    id: 'stheno-v3.4-8b',
    name: 'L3.1-8B-Stheno v3.4',
    ollamaId: 'stheno:8b',
    provider: 'ollama',
    parameterCount: 8,
    contextWindow: 131072,
    isUncensored: true,
    contentRating: 'mature',
    qualityRatings: {
      creativeWriting: 9,
      characterVoice: 9,
      instructionFollowing: 8,
      roleplayImmersion: 9,
    },
    speedTier: 'very-fast',
    vramRequirements: { q4: '5GB', q5: '6GB', q8: '9GB', fp16: '16GB' },
    license: 'Llama 3.1 Community',
    tags: ['nsfw', 'anime', 'edgy', 'uncensored', 'roleplay', '128k-context', 'conversational'],
    description:
      'By Sao10K — multi-stage finetuned Llama 3.1 with exceptional character voice consistency. Community favorite for anime girl chat with 128k context. Punches way above its weight class.',
    pullCommand: 'ollama pull stheno:8b',
  },
  {
    id: 'midnight-miqu-70b',
    name: 'Midnight Miqu 70B v1.5',
    openRouterId: 'sophosympatheia/midnight-miqu-70b-v1.5',
    provider: 'openrouter',
    parameterCount: 70,
    contextWindow: 32768,
    isUncensored: true,
    contentRating: 'mature',
    qualityRatings: {
      creativeWriting: 10,
      characterVoice: 10,
      instructionFollowing: 9,
      roleplayImmersion: 10,
    },
    speedTier: 'slow',
    vramRequirements: { q4: '40GB', q5: '48GB', q8: '72GB', fp16: '140GB' },
    license: 'Apache 2.0',
    tags: ['nsfw', 'premium', 'edgy', 'uncensored', 'creative', 'roleplay', 'cloud'],
    description:
      'The legendary Midnight Miqu — a SLERP merge of Miqu-70B and Midnight-Rose. Widely considered the GOAT of uncensored roleplay. Stunningly literary prose, deeply immersive character work. Cloud-only for most users.',
  },
  {
    id: 'kunoichi-dpo-v2-7b',
    name: 'Kunoichi DPO v2 7B',
    ollamaId: 'kunoichi-dpo:7b',
    provider: 'ollama',
    parameterCount: 7,
    contextWindow: 4096,
    isUncensored: true,
    contentRating: 'mature',
    qualityRatings: {
      creativeWriting: 7,
      characterVoice: 8,
      instructionFollowing: 7,
      roleplayImmersion: 8,
    },
    speedTier: 'very-fast',
    vramRequirements: { q4: '4GB', q5: '5GB', q8: '8GB', fp16: '14GB' },
    license: 'Llama 2 Community',
    tags: ['nsfw', 'anime', 'waifu', 'lightweight', 'uncensored', 'conversational'],
    description:
      'SLERP merge of Silicon-Maid and Ninja-7B. Built for RP while maintaining reasoning ability. Runs on practically anything — great entry point for anime companion chat.',
    pullCommand: 'ollama pull kunoichi-dpo:7b',
  },
  {
    id: 'pygmalion-2-7b',
    name: 'Pygmalion 2 7B',
    ollamaId: 'pygmalion-2:7b',
    provider: 'ollama',
    parameterCount: 7,
    contextWindow: 4096,
    isUncensored: true,
    contentRating: 'mature',
    qualityRatings: {
      creativeWriting: 7,
      characterVoice: 8,
      instructionFollowing: 6,
      roleplayImmersion: 8,
    },
    speedTier: 'very-fast',
    vramRequirements: { q4: '4GB', q5: '5GB', q8: '8GB', fp16: '14GB' },
    license: 'Apache 2.0',
    tags: ['nsfw', 'anime', 'waifu', 'classic', 'uncensored', 'conversational', 'open-source'],
    description:
      'The OG open-source waifu model by PygmalionAI. A cornerstone of the uncensored AI chat community. Trained specifically for conversational roleplay with no restrictions.',
    pullCommand: 'ollama pull pygmalion-2:7b',
  },
  {
    id: 'dark-planet-8b',
    name: 'Llama 3.1 Dark Planet Uncensored 8B',
    ollamaId: 'dark-planet:8b',
    provider: 'ollama',
    parameterCount: 8,
    contextWindow: 131072,
    isUncensored: true,
    contentRating: 'mature',
    qualityRatings: {
      creativeWriting: 8,
      characterVoice: 8,
      instructionFollowing: 7,
      roleplayImmersion: 8,
    },
    speedTier: 'very-fast',
    vramRequirements: { q4: '5GB', q5: '6GB', q8: '9GB', fp16: '16GB' },
    license: 'Llama 3.1 Community',
    tags: ['nsfw', 'edgy', 'uncensored', 'abliterated', '128k-context', 'dark-themes'],
    description:
      'DavidAU\'s Llama 3.1 with 128k context, abliterated + additional de-censoring steps. Excels at dark, gritty, and mature storytelling. No guardrails whatsoever.',
    pullCommand: 'ollama pull dark-planet:8b',
  },
  {
    id: 'rogue-creative-7b',
    name: 'L3.2 Rogue Creative Uncensored 7B',
    ollamaId: 'rogue-creative:7b',
    provider: 'ollama',
    parameterCount: 7,
    contextWindow: 131072,
    isUncensored: true,
    contentRating: 'mature',
    qualityRatings: {
      creativeWriting: 8,
      characterVoice: 7,
      instructionFollowing: 7,
      roleplayImmersion: 8,
    },
    speedTier: 'very-fast',
    vramRequirements: { q4: '4GB', q5: '5GB', q8: '8GB', fp16: '14GB' },
    license: 'Llama 3.2 Community',
    tags: ['nsfw', 'edgy', 'uncensored', 'abliterated', 'creative', 'lightweight'],
    description:
      'DavidAU\'s abliterated Llama 3.2 tuned for creative, uncensored output. Great balance of speed and expressiveness for edgy roleplay on low VRAM.',
    pullCommand: 'ollama pull rogue-creative:7b',
  },
  {
    id: 'dark-champion-moe-21b',
    name: 'Dark Champion MoE v2 21B',
    ollamaId: 'dark-champion:21b',
    provider: 'ollama',
    parameterCount: 21,
    contextWindow: 131072,
    isUncensored: true,
    contentRating: 'mature',
    qualityRatings: {
      creativeWriting: 10,
      characterVoice: 9,
      instructionFollowing: 8,
      roleplayImmersion: 9,
    },
    speedTier: 'fast',
    vramRequirements: { q4: '13GB', q5: '15GB', q8: '23GB', fp16: '42GB' },
    license: 'Llama 3.2 Community',
    tags: ['nsfw', 'edgy', 'uncensored', 'abliterated', 'moe', 'creative', 'premium-local'],
    description:
      'DavidAU\'s Mixture-of-Experts masterpiece. Detail, prose, and fiction writing described as "OFF THE SCALE." 8x4B MoE architecture runs faster than you\'d expect at 21B. The local king for mature creative RP.',
    pullCommand: 'ollama pull dark-champion:21b',
  },
  {
    id: 'fimbulvetr-11b',
    name: 'Fimbulvetr 11B v2',
    ollamaId: 'fimbulvetr:11b',
    provider: 'ollama',
    parameterCount: 11,
    contextWindow: 4096,
    isUncensored: true,
    contentRating: 'mature',
    qualityRatings: {
      creativeWriting: 8,
      characterVoice: 8,
      instructionFollowing: 7,
      roleplayImmersion: 8,
    },
    speedTier: 'fast',
    vramRequirements: { q4: '7GB', q5: '8GB', q8: '12GB', fp16: '22GB' },
    license: 'Apache 2.0',
    tags: ['nsfw', 'anime', 'uncensored', 'roleplay', 'conversational'],
    description:
      'By Sao10K — trained on a curated mix of online RP data. Strong character consistency and natural-feeling dialogue. Named after the great winter of Norse mythology — fitting for a model with zero chill.',
    pullCommand: 'ollama pull fimbulvetr:11b',
  },
  {
    id: 'rocinante-12b',
    name: 'Rocinante 12B v1.1',
    ollamaId: 'rocinante:12b',
    provider: 'ollama',
    parameterCount: 12,
    contextWindow: 131072,
    isUncensored: true,
    contentRating: 'mature',
    qualityRatings: {
      creativeWriting: 9,
      characterVoice: 8,
      instructionFollowing: 8,
      roleplayImmersion: 9,
    },
    speedTier: 'fast',
    vramRequirements: { q4: '8GB', q5: '9GB', q8: '13GB', fp16: '24GB' },
    license: 'Llama 3 Community',
    tags: ['nsfw', 'edgy', 'uncensored', 'creative', 'roleplay', '128k-context'],
    description:
      'A community-beloved 12B merge that punches into 20B+ territory for creative writing. Great world-building, emotionally rich character interactions, and long-context support.',
    pullCommand: 'ollama pull rocinante:12b',
  },
  {
    id: 'qwen3-hivemind-heretic-8b',
    name: 'Qwen3 8B Hivemind Heretic Abliterated',
    ollamaId: 'qwen3-heretic:8b',
    provider: 'ollama',
    parameterCount: 8,
    contextWindow: 32768,
    isUncensored: true,
    contentRating: 'mature',
    qualityRatings: {
      creativeWriting: 8,
      characterVoice: 7,
      instructionFollowing: 8,
      roleplayImmersion: 8,
    },
    speedTier: 'very-fast',
    vramRequirements: { q4: '5GB', q5: '6GB', q8: '9GB', fp16: '16GB' },
    license: 'Apache 2.0',
    tags: ['nsfw', 'edgy', 'uncensored', 'abliterated', 'qwen', 'fast'],
    description:
      'DavidAU\'s abliterated Qwen3 with the "Heretic" treatment — full de-censoring on Alibaba\'s excellent Qwen3 base. Surprisingly good at flirty, playful anime chat.',
    pullCommand: 'ollama pull qwen3-heretic:8b',
  },
  {
    id: 'chronos-hermes-13b',
    name: 'Chronos Hermes 13B',
    ollamaId: 'chronos-hermes:13b',
    provider: 'ollama',
    parameterCount: 13,
    contextWindow: 16384,
    isUncensored: true,
    contentRating: 'mature',
    qualityRatings: {
      creativeWriting: 8,
      characterVoice: 8,
      instructionFollowing: 8,
      roleplayImmersion: 8,
    },
    speedTier: 'fast',
    vramRequirements: { q4: '8GB', q5: '9GB', q8: '14GB', fp16: '26GB' },
    license: 'Llama 2 Community',
    tags: ['nsfw', 'uncensored', 'long-context', 'roleplay', 'consistent'],
    description:
      'Remembers ~16k tokens across long conversations with remarkable consistency. Handles complex characters and mature storylines with a natural, grounded tone. A sleeper pick.',
    pullCommand: 'ollama pull chronos-hermes:13b',
  },
  {
    id: 'openai-gpt-oss-abliterated-20b',
    name: 'OpenAI GPT-OSS 20B Abliterated',
    ollamaId: 'gpt-oss-abliterated:20b',
    provider: 'ollama',
    parameterCount: 20,
    contextWindow: 32768,
    isUncensored: true,
    contentRating: 'mature',
    qualityRatings: {
      creativeWriting: 8,
      characterVoice: 8,
      instructionFollowing: 9,
      roleplayImmersion: 8,
    },
    speedTier: 'fast',
    vramRequirements: { q4: '12GB', q5: '14GB', q8: '22GB', fp16: '40GB' },
    license: 'MIT',
    tags: ['nsfw', 'edgy', 'uncensored', 'abliterated', 'moe', 'openai-base'],
    description:
      'DavidAU\'s abliterated version of OpenAI\'s open-source 20B MoE model. Runs at 80+ tokens/sec. The irony of an uncensored OpenAI model is not lost on us.',
    pullCommand: 'ollama pull gpt-oss-abliterated:20b',
  },

  // ── Abliterated / Uncensored Community Favorites (HuggingFace + Ollama) ───

  {
    id: 'dolphin3-abliterated-8b',
    name: 'Dolphin 3.0 Abliterated 8B',
    ollamaId: 'huihui_ai/dolphin3-abliterated:8b',
    provider: 'ollama',
    parameterCount: 8,
    contextWindow: 131072,
    isUncensored: true,
    contentRating: 'mature',
    qualityRatings: {
      creativeWriting: 8,
      characterVoice: 8,
      instructionFollowing: 9,
      roleplayImmersion: 8,
    },
    speedTier: 'very-fast',
    vramRequirements: { q4: '5GB', q5: '6GB', q8: '9GB', fp16: '16GB' },
    license: 'Llama 3.1 Community',
    tags: ['nsfw', 'uncensored', 'abliterated', 'dolphin', 'instruction-following', 'fast'],
    description:
      'Eric Hartford\'s Dolphin 3.0 with abliteration applied by huihui_ai. The Dolphin series is trained on data filtered to remove alignment/bias, and abliteration removes any remaining refusal. 60K+ pulls on Ollama. Excellent instruction following.',
    pullCommand: 'ollama pull huihui_ai/dolphin3-abliterated:8b',
  },
  {
    id: 'dolphin-llama3-8b',
    name: 'Dolphin 2.9 Llama 3 8B',
    ollamaId: 'dolphin-llama3',
    provider: 'ollama',
    parameterCount: 8,
    contextWindow: 8192,
    isUncensored: true,
    contentRating: 'edgy',
    qualityRatings: {
      creativeWriting: 7,
      characterVoice: 7,
      instructionFollowing: 9,
      roleplayImmersion: 7,
    },
    speedTier: 'very-fast',
    vramRequirements: { q4: '5GB', q5: '6GB', q8: '9GB', fp16: '16GB' },
    license: 'Llama 3 Community',
    tags: ['uncensored', 'dolphin', 'instruction-following', 'fast', 'popular'],
    description:
      'Official Dolphin on Llama 3 base by Eric Hartford / Cognitive Computations. Trained on data with alignment removed — compliant by design rather than abliteration. Rock-solid instruction following and widely tested.',
    pullCommand: 'ollama pull dolphin-llama3',
  },
  {
    id: 'wizardlm-uncensored-13b',
    name: 'WizardLM 13B Uncensored',
    ollamaId: 'wizardlm-uncensored:13b',
    provider: 'ollama',
    parameterCount: 13,
    contextWindow: 4096,
    isUncensored: true,
    contentRating: 'edgy',
    qualityRatings: {
      creativeWriting: 7,
      characterVoice: 7,
      instructionFollowing: 8,
      roleplayImmersion: 7,
    },
    speedTier: 'fast',
    vramRequirements: { q4: '8GB', q5: '9GB', q8: '14GB', fp16: '26GB' },
    license: 'Llama 2 Community',
    tags: ['uncensored', 'classic', 'instruction-following', 'eric-hartford'],
    description:
      'Eric Hartford\'s classic uncensored WizardLM — one of the earliest and most influential uncensored fine-tunes. Based on Llama 2 13B with all refusal training data removed. A piece of open-source AI history.',
    pullCommand: 'ollama pull wizardlm-uncensored:13b',
  },
  {
    id: 'psyfighter2-13b',
    name: 'Psyfighter 2 13B',
    ollamaId: 'hf.co/TheBloke/LLaMA2-13B-Psyfighter2-GGUF',
    provider: 'ollama',
    parameterCount: 13,
    contextWindow: 4096,
    isUncensored: true,
    contentRating: 'mature',
    qualityRatings: {
      creativeWriting: 8,
      characterVoice: 8,
      instructionFollowing: 7,
      roleplayImmersion: 9,
    },
    speedTier: 'fast',
    vramRequirements: { q4: '8GB', q5: '9GB', q8: '14GB', fp16: '26GB' },
    license: 'Llama 2 Community',
    tags: ['nsfw', 'roleplay', 'uncensored', 'creative', 'koboldai', 'classic'],
    description:
      'By Jeb Carter / KoboldAI — a merge specifically designed for creative RP with deep psychological character depth. The name says it all: it fights for your right to psychologically complex characters. GGUF on HuggingFace via TheBloke.',
    pullCommand: 'ollama run hf.co/TheBloke/LLaMA2-13B-Psyfighter2-GGUF',
  },
  {
    id: 'eva-qwen25-14b',
    name: 'Eva Qwen 2.5 14B',
    ollamaId: 'hf.co/bartowski/Eva-Qwen2.5-14B-v0.2-GGUF',
    provider: 'ollama',
    parameterCount: 14,
    contextWindow: 32768,
    isUncensored: true,
    contentRating: 'mature',
    qualityRatings: {
      creativeWriting: 9,
      characterVoice: 9,
      instructionFollowing: 8,
      roleplayImmersion: 9,
    },
    speedTier: 'fast',
    vramRequirements: { q4: '9GB', q5: '11GB', q8: '16GB', fp16: '28GB' },
    license: 'Qwen License',
    tags: ['nsfw', 'anime', 'roleplay', 'uncensored', 'qwen', 'waifu', 'creative'],
    description:
      'Fine-tuned specifically for roleplaying, NSFW storytelling, and creative writing on Alibaba\'s Qwen 2.5 base. Praised by the Private LLM community as "the best uncensored AI for roleplay on Apple Silicon." Emotionally rich character voices.',
    pullCommand: 'ollama run hf.co/bartowski/Eva-Qwen2.5-14B-v0.2-GGUF',
  },
  {
    id: 'qwen35-abliterated-9b',
    name: 'Qwen 3.5 9B Abliterated',
    ollamaId: 'huihui_ai/qwen3.5-abliterated:9b',
    provider: 'ollama',
    parameterCount: 9,
    contextWindow: 32768,
    isUncensored: true,
    contentRating: 'mature',
    qualityRatings: {
      creativeWriting: 8,
      characterVoice: 8,
      instructionFollowing: 9,
      roleplayImmersion: 8,
    },
    speedTier: 'very-fast',
    vramRequirements: { q4: '6GB', q5: '7GB', q8: '10GB', fp16: '18GB' },
    license: 'Apache 2.0',
    tags: ['nsfw', 'uncensored', 'abliterated', 'qwen', 'fast', 'latest'],
    description:
      'huihui_ai\'s abliterated Qwen 3.5 — the latest generation. 60K+ pulls on Ollama. Excellent reasoning + zero refusals. Available in sizes from 0.8B to 122B. The 9B sweet spot runs beautifully on 16GB VRAM.',
    pullCommand: 'ollama pull huihui_ai/qwen3.5-abliterated:9b',
  },
  {
    id: 'gemma3-abliterated-12b',
    name: 'Gemma 3 12B Abliterated',
    ollamaId: 'mdq100/Gemma3-Instruct-Abliterated:12b',
    provider: 'ollama',
    parameterCount: 12,
    contextWindow: 32768,
    isUncensored: true,
    contentRating: 'mature',
    qualityRatings: {
      creativeWriting: 8,
      characterVoice: 7,
      instructionFollowing: 9,
      roleplayImmersion: 7,
    },
    speedTier: 'fast',
    vramRequirements: { q4: '8GB', q5: '9GB', q8: '13GB', fp16: '24GB' },
    license: 'Gemma Terms',
    tags: ['uncensored', 'abliterated', 'google', 'instruction-following'],
    description:
      'Google Gemma 3 with abliteration applied. 16K+ pulls on Ollama. Gemma\'s strong reasoning base + no refusal guardrails. Better for general uncensored use than pure RP, but handles character chat well.',
    pullCommand: 'ollama pull mdq100/Gemma3-Instruct-Abliterated:12b',
  },
  {
    id: 'glm47-flash-abliterated',
    name: 'GLM 4.7 Flash Abliterated',
    ollamaId: 'huihui_ai/glm-4.7-flash-abliterated',
    provider: 'ollama',
    parameterCount: 9,
    contextWindow: 32768,
    isUncensored: true,
    contentRating: 'mature',
    qualityRatings: {
      creativeWriting: 7,
      characterVoice: 7,
      instructionFollowing: 8,
      roleplayImmersion: 7,
    },
    speedTier: 'very-fast',
    vramRequirements: { q4: '6GB', q5: '7GB', q8: '10GB', fp16: '18GB' },
    license: 'Apache 2.0',
    tags: ['uncensored', 'abliterated', 'fast', 'chinese-base', 'flash'],
    description:
      'Tsinghua University\'s GLM-4.7 Flash with abliteration. 47K+ pulls on Ollama. "Flash" means it\'s optimized for speed. Great for quick, snappy chat responses with no guardrails.',
    pullCommand: 'ollama pull huihui_ai/glm-4.7-flash-abliterated',
  },
  {
    id: 'deepseek-r1-abliterated-14b',
    name: 'DeepSeek R1 Distill 14B Abliterated',
    ollamaId: 'huihui_ai/deepseek-r1-abliterated:14b',
    provider: 'ollama',
    parameterCount: 14,
    contextWindow: 32768,
    isUncensored: true,
    contentRating: 'mature',
    qualityRatings: {
      creativeWriting: 8,
      characterVoice: 7,
      instructionFollowing: 9,
      roleplayImmersion: 7,
    },
    speedTier: 'fast',
    vramRequirements: { q4: '9GB', q5: '11GB', q8: '16GB', fp16: '28GB' },
    license: 'MIT',
    tags: ['uncensored', 'abliterated', 'reasoning', 'deepseek', 'chain-of-thought'],
    description:
      'DeepSeek R1 distilled to Qwen 2.5 14B, then abliterated. Chain-of-thought reasoning with no refusals. Writes methodical, well-structured creative content. Better at "smart" characters than purely emotional ones.',
    pullCommand: 'ollama pull huihui_ai/deepseek-r1-abliterated:14b',
  },
  {
    id: 'mistral-small-abliterated',
    name: 'Mistral Small 3.1 Abliterated',
    ollamaId: 'huihui_ai/mistral-small-abliterated',
    provider: 'ollama',
    parameterCount: 24,
    contextWindow: 32768,
    isUncensored: true,
    contentRating: 'mature',
    qualityRatings: {
      creativeWriting: 8,
      characterVoice: 8,
      instructionFollowing: 9,
      roleplayImmersion: 8,
    },
    speedTier: 'fast',
    vramRequirements: { q4: '14GB', q5: '16GB', q8: '26GB', fp16: '48GB' },
    license: 'Apache 2.0',
    tags: ['nsfw', 'uncensored', 'abliterated', 'mistral', 'premium-local'],
    description:
      'Mistral\'s excellent Small 3.1 (24B) with abliteration. Fits on a 16GB GPU at Q4. Strong creative writing with Mistral\'s characteristic "French flair" — elegant prose, nuanced emotional beats.',
    pullCommand: 'ollama pull huihui_ai/mistral-small-abliterated',
  },
  {
    id: 'gemma-27b-abliterated',
    name: 'Gemma 3 27B Abliterated',
    ollamaId: 'patrickwarren2692/gemma-3-27b-it-abliterated-GGUF',
    provider: 'ollama',
    parameterCount: 27,
    contextWindow: 32768,
    isUncensored: true,
    contentRating: 'mature',
    qualityRatings: {
      creativeWriting: 9,
      characterVoice: 8,
      instructionFollowing: 9,
      roleplayImmersion: 8,
    },
    speedTier: 'medium',
    vramRequirements: { q4: '16GB', q5: '20GB', q8: '29GB', fp16: '54GB' },
    license: 'Gemma Terms',
    tags: ['nsfw', 'uncensored', 'abliterated', 'google', 'large', 'premium-local'],
    description:
      'The big Gemma 3 27B abliterated — just barely fits on 16GB VRAM at Q4. When it does fit, it\'s remarkably articulate and creative. Google\'s strong base model shines through with rich, detailed prose.',
    pullCommand: 'ollama pull patrickwarren2692/gemma-3-27b-it-abliterated-GGUF',
  },

  // ── Waifu / Anime-Girl–Focused Chat LLMs (HuggingFace) ──────────────────

  {
    id: 'waifuai-l3-8b',
    name: 'WaifuAI L3 8B',
    ollamaId: 'hf.co/Abdulhanan2006/WaifuAI-L3-8B-8k-gguf',
    provider: 'ollama',
    parameterCount: 8,
    contextWindow: 8192,
    isUncensored: true,
    contentRating: 'mature',
    qualityRatings: {
      creativeWriting: 7,
      characterVoice: 8,
      instructionFollowing: 7,
      roleplayImmersion: 8,
    },
    speedTier: 'very-fast',
    vramRequirements: { q4: '5GB', q5: '6GB', q8: '9GB', fp16: '16GB' },
    license: 'Apache 2.0',
    tags: ['waifu', 'anime', 'nsfw', 'girl-chat', 'gguf-available', 'llama3'],
    description:
      'Llama 3 8B fine-tuned specifically for waifu/anime-girl chat. GGUF available for easy local deployment. Marked as not-for-all-audiences. Purpose-built for the anime companion chat use case.',
    pullCommand: 'ollama run hf.co/Abdulhanan2006/WaifuAI-L3-8B-8k-gguf',
  },
  {
    id: 'anime-waifu-mistral-lora',
    name: 'Anime Waifu Mistral 7B (LoRA)',
    ollamaId: 'hf.co/maomao88/anime-waifu-mistral-lora',
    provider: 'ollama',
    parameterCount: 7,
    contextWindow: 32768,
    isUncensored: false,
    contentRating: 'edgy',
    qualityRatings: {
      creativeWriting: 7,
      characterVoice: 9,
      instructionFollowing: 7,
      roleplayImmersion: 8,
    },
    speedTier: 'very-fast',
    vramRequirements: { q4: '4GB', q5: '5GB', q8: '8GB', fp16: '14GB' },
    license: 'MIT',
    tags: ['waifu', 'anime', 'personality', 'tsundere', 'yandere', 'genki', 'lora', 'mistral'],
    description:
      'Mistral 7B LoRA trained on anime personality archetypes — tsundere, yandere, genki, kuudere, dandere. Feed it a personality trait and it stays in character. Tiny 744-sample fine-tune but nails the anime tropes. MIT licensed.',
    pullCommand: 'ollama run hf.co/maomao88/anime-waifu-mistral-lora',
  },
  {
    id: 'moe-girl-3b',
    name: 'MoE Girl 3B (800M Active)',
    ollamaId: 'hf.co/DevQuasar/allura-org.MoE-Girl-800MA-3BT-GGUF',
    provider: 'ollama',
    parameterCount: 3,
    contextWindow: 4096,
    isUncensored: false,
    contentRating: 'edgy',
    qualityRatings: {
      creativeWriting: 6,
      characterVoice: 7,
      instructionFollowing: 6,
      roleplayImmersion: 7,
    },
    speedTier: 'very-fast',
    vramRequirements: { q4: '2GB', q5: '2.5GB', q8: '3.5GB', fp16: '6GB' },
    license: 'Apache 2.0',
    tags: ['waifu', 'anime', 'girl-chat', 'moe', 'ultra-lightweight', 'ibm-granite', 'gguf-available'],
    description:
      'Allura\'s MoE Girl — only 800M active parameters in a 3B MoE shell on IBM Granite base. Runs on literally anything including phones. GGUF from Q2 (1.2GB) to Q8 (3.5GB). Perfect for "it just works" on potato hardware.',
    pullCommand: 'ollama run hf.co/DevQuasar/allura-org.MoE-Girl-800MA-3BT-GGUF',
  },
  {
    id: 'gemma3-waifu-4b',
    name: 'Gemma 3 Waifu Finetune 4B',
    ollamaId: 'hf.co/Scarlet-Raine/gemma-3-waifu-finetune-121',
    provider: 'ollama',
    parameterCount: 4,
    contextWindow: 8192,
    isUncensored: false,
    contentRating: 'edgy',
    qualityRatings: {
      creativeWriting: 7,
      characterVoice: 8,
      instructionFollowing: 7,
      roleplayImmersion: 8,
    },
    speedTier: 'very-fast',
    vramRequirements: { q4: '3GB', q5: '3.5GB', q8: '5GB', fp16: '8GB' },
    license: 'Apache 2.0',
    tags: ['waifu', 'anime', 'gemma', 'lightweight', 'girl-chat', 'fine-tune'],
    description:
      'Scarlet-Raine\'s Gemma 3 4B waifu fine-tune (v1.21 — latest iteration of a series). Built on Google\'s strong Gemma 3 base with anime character personality training via Unsloth. Apache 2.0 and tiny enough to run on anything.',
    pullCommand: 'ollama run hf.co/Scarlet-Raine/gemma-3-waifu-finetune-121',
  },
  {
    id: 'anime-qwen3-14b',
    name: 'Anime LLM Qwen3 14B',
    ollamaId: 'hf.co/kujirahand/anime_llm_qwen3_14b',
    provider: 'ollama',
    parameterCount: 14,
    contextWindow: 32768,
    isUncensored: false,
    contentRating: 'general',
    qualityRatings: {
      creativeWriting: 8,
      characterVoice: 8,
      instructionFollowing: 8,
      roleplayImmersion: 7,
    },
    speedTier: 'fast',
    vramRequirements: { q4: '9GB', q5: '11GB', q8: '16GB', fp16: '28GB' },
    license: 'Qwen License',
    tags: ['anime', 'japanese', 'qwen3', 'knowledge', 'character-info'],
    description:
      'Qwen3 14B fine-tuned on anime protagonist profiles and plot summaries. Japanese-focused. Excellent at staying in-universe — knows character backstories, arcs, and relationships from training data. Best paired with a companion persona profile.',
    pullCommand: 'ollama run hf.co/kujirahand/anime_llm_qwen3_14b',
  },
  {
    id: 'gemma2-9b-girl',
    name: 'Gemma 2 9B Girl v1',
    ollamaId: 'hf.co/Akimite/Gemma2-9b-it-Girl-v1',
    provider: 'ollama',
    parameterCount: 9,
    contextWindow: 8192,
    isUncensored: false,
    contentRating: 'general',
    qualityRatings: {
      creativeWriting: 7,
      characterVoice: 8,
      instructionFollowing: 8,
      roleplayImmersion: 7,
    },
    speedTier: 'fast',
    vramRequirements: { q4: '6GB', q5: '7GB', q8: '10GB', fp16: '18GB' },
    license: 'Gemma Terms',
    tags: ['anime', 'girl-chat', 'japanese', 'gemma', 'personality', 'ojou-sama'],
    description:
      'Gemma 2 9B fine-tuned with an "AI ojou-sama" (refined lady) personality. Japanese-focused. Curious, playful, slightly cheeky. Has safety guardrails but stays in character. Good for wholesome anime companion chat.',
    pullCommand: 'ollama run hf.co/Akimite/Gemma2-9b-it-Girl-v1',
  },

  // ── New Research Wave: Dark Waifu + Qwen3.5 Uncensored ─────────────────

  {
    id: 'neural-dark-waifu-7b',
    name: 'Neural Dark Waifu v0.2 7B',
    ollamaId: 'hf.co/nocudaexe/Neural-Dark-Waifu-V0.2-GGUF',
    provider: 'ollama',
    parameterCount: 7,
    contextWindow: 15872,
    isUncensored: true,
    contentRating: 'mature',
    qualityRatings: {
      creativeWriting: 8,
      characterVoice: 8,
      instructionFollowing: 7,
      roleplayImmersion: 9,
    },
    speedTier: 'very-fast',
    vramRequirements: { q4: '4GB', q5: '5GB', q8: '8GB', fp16: '14GB' },
    license: 'Apache 2.0',
    tags: ['nsfw', 'waifu', 'anime', 'dark', 'roleplay', 'uncensored', 'slerp-merge', 'gguf-available'],
    description:
      'nocudaexe\'s Slerp merge of Dark-Waifu + Infinite-Waifu + AlphaMonarch. Mistral-based, trained specifically for ERP/waifu roleplay. v0.2 fixes context handling issues from v0.1. GGUF available. Apache 2.0.',
    pullCommand: 'ollama run hf.co/nocudaexe/Neural-Dark-Waifu-V0.2-GGUF',
  },
  {
    id: 'qwen35-9b-uncensored-aggressive',
    name: 'Qwen 3.5 9B Uncensored Aggressive',
    ollamaId: 'hf.co/HauhauCS/Qwen3.5-9B-Uncensored-HauhauCS-Aggressive',
    provider: 'ollama',
    parameterCount: 9,
    contextWindow: 262144,
    isUncensored: true,
    contentRating: 'mature',
    qualityRatings: {
      creativeWriting: 9,
      characterVoice: 8,
      instructionFollowing: 9,
      roleplayImmersion: 8,
    },
    speedTier: 'fast',
    vramRequirements: { q4: '5.3GB', q5: '6GB', q8: '8.9GB', fp16: '17GB' },
    license: 'Apache 2.0',
    tags: ['nsfw', 'uncensored', 'qwen3.5', 'aggressive', 'multimodal', 'vision', 'latest', '262k-context'],
    description:
      'HauhauCS\'s aggressively uncensored Qwen3.5-9B — 0/465 refusals with zero capability loss. 220K+ monthly downloads. Supports text + image + video input natively. 262K context (extendable to 1M). The newest Qwen architecture with hybrid DeltaNet attention. This is the bleeding edge.',
    pullCommand: 'ollama run hf.co/HauhauCS/Qwen3.5-9B-Uncensored-HauhauCS-Aggressive',
  },
];

// ============================================================================
// RECOMMENDED TTS MODELS
// ============================================================================

export const RECOMMENDED_TTS_MODELS: RecommendedTTSModel[] = [
  {
    id: 'gpt-sovits',
    name: 'GPT-SoVITS',
    type: 'local',
    qualityRating: 10,
    latency: '1-3 seconds',
    hasVoiceCloning: true,
    languages: ['Chinese', 'Japanese', 'English'],
    vramRequirement: '4-8GB',
    license: 'MIT',
    repoUrl: 'https://github.com/RVC-Boss/GPT-SoVITS',
    description:
      'Top choice for anime voices. Supports voice cloning and generates very natural, expressive speech with anime-style characteristics.',
    tags: ['anime', 'voice-cloning', 'high-quality', 'top-pick', 'expressive'],
    bestFor: 'Anime character voices with cloning and fine control',
  },

  {
    id: 'fish-speech-s2',
    name: 'Fish Speech S2',
    type: 'local',
    qualityRating: 9,
    latency: '0.5-2 seconds',
    hasVoiceCloning: true,
    languages: ['Chinese', 'Japanese', 'English'],
    vramRequirement: '3-6GB',
    license: 'Proprietary',
    repoUrl: 'https://fish.audio',
    description:
      'High-quality synthesis with voice cloning. Fast and efficient. Excellent for character voices and natural-sounding speech.',
    tags: ['voice-cloning', 'fast', 'high-quality', 'multilingual'],
    bestFor: 'Fast, natural voice synthesis with cloning capabilities',
  },

  {
    id: 'chatterbox-turbo',
    name: 'Chatterbox Turbo',
    type: 'local',
    qualityRating: 8,
    latency: '0.5-1 second',
    hasVoiceCloning: false,
    languages: ['English'],
    vramRequirement: '2-4GB',
    license: 'Proprietary',
    description:
      'Ultra-fast TTS model optimized for low latency. Great for real-time interactions. Limited language support but excellent for English.',
    tags: ['fast', 'low-latency', 'english', 'real-time'],
    bestFor: 'Real-time conversational TTS',
  },

  {
    id: 'f5-tts',
    name: 'F5-TTS',
    type: 'local',
    qualityRating: 8,
    latency: '1-2 seconds',
    hasVoiceCloning: true,
    languages: ['English', 'Chinese'],
    vramRequirement: '2-4GB',
    license: 'MIT',
    repoUrl: 'https://github.com/SWivid/F5-TTS',
    description:
      'Lightweight yet high-quality synthesis. Supports voice cloning with minimal VRAM requirements. Good balance of quality and efficiency.',
    tags: ['lightweight', 'voice-cloning', 'efficient'],
    bestFor: 'Memory-efficient voice synthesis with cloning',
  },

  {
    id: 'cosyvoice-3',
    name: 'CosyVoice 3.0',
    type: 'local',
    qualityRating: 9,
    latency: '1-3 seconds',
    hasVoiceCloning: true,
    languages: ['Chinese', 'English', 'Japanese'],
    vramRequirement: '4-8GB',
    license: 'Proprietary',
    repoUrl: 'https://github.com/microsoft/CosyVoice',
    description:
      'Microsoft research model with excellent naturalness and expressiveness. Supports voice cloning and multilingual synthesis.',
    tags: ['high-quality', 'voice-cloning', 'expressive', 'multilingual'],
    bestFor: 'Natural, expressive multilingual voice synthesis',
  },

  {
    id: 'kokoro-82m',
    name: 'Kokoro 82M',
    type: 'local',
    qualityRating: 7,
    latency: '0.2-0.5 seconds',
    hasVoiceCloning: false,
    languages: ['English'],
    vramRequirement: '1-2GB',
    license: 'Apache 2.0',
    repoUrl: 'https://github.com/hexgrad/kokoro',
    description:
      'Extremely lightweight model with very fast inference. Minimal VRAM footprint. Good for low-end hardware with English support.',
    tags: ['lightweight', 'ultra-fast', 'minimal-vram', 'efficient'],
    bestFor: 'Ultra-lightweight real-time TTS on low-end hardware',
  },

  {
    id: 'voicevox',
    name: 'VoiceVox',
    type: 'local',
    qualityRating: 8,
    latency: '0.5-2 seconds',
    hasVoiceCloning: false,
    languages: ['Japanese'],
    vramRequirement: '2-4GB',
    license: 'LGPL/Proprietary Hybrid',
    repoUrl: 'https://voicevox.hiroshiba.jp/',
    description:
      'Japanese-specialized TTS with anime-style voice presets. Multiple character voices. Excellent for anime content.',
    tags: ['japanese', 'anime', 'character-voices', 'stylized'],
    bestFor: 'Japanese anime-style character voices',
  },

  {
    id: 'piper-tts',
    name: 'Piper TTS',
    type: 'local',
    qualityRating: 6,
    latency: '0.2-0.5 seconds',
    hasVoiceCloning: false,
    languages: ['English', 'Spanish', 'French', 'German', 'More'],
    vramRequirement: '0.5-2GB',
    license: 'MIT',
    repoUrl: 'https://github.com/rhasspy/piper',
    description:
      'Very lightweight and fast. Supports many languages with minimal resources. Good for accessibility and low-resource setups.',
    tags: ['lightweight', 'fast', 'multilingual', 'open-source'],
    bestFor: 'Lightweight multilingual TTS on constrained hardware',
  },

  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    type: 'cloud',
    qualityRating: 9,
    latency: '1-2 seconds',
    hasVoiceCloning: true,
    languages: ['29+ languages'],
    vramRequirement: 'N/A (Cloud)',
    license: 'Commercial',
    repoUrl: 'https://elevenlabs.io',
    description:
      'Premium cloud TTS service with exceptional quality. Supports voice cloning and multilingual synthesis. Requires API key.',
    tags: ['cloud', 'premium', 'voice-cloning', 'professional', 'multilingual'],
    bestFor: 'Professional-grade voice synthesis via cloud API',
  },

  // ── Anime-Specific TTS/STT Models (HuggingFace discoveries) ──

  {
    id: 'anime-whisper',
    name: 'Anime Whisper (STT)',
    type: 'local',
    qualityRating: 9,
    latency: '0.5-2 seconds',
    hasVoiceCloning: false,
    languages: ['Japanese'],
    vramRequirement: '2-4GB',
    license: 'MIT',
    repoUrl: 'https://huggingface.co/litagin/anime-whisper',
    description:
      'Whisper Large V3 distilled + fine-tuned on 5,300 hours of anime/visual-novel speech. Beats whisper-large-v3 on anime CER (13.0 vs 16.5). Captures stuttering, laughter, breathing, emotional punctuation. The gold standard for anime STT.',
    tags: ['stt', 'anime', 'japanese', 'whisper', 'speech-recognition', 'visual-novel', 'top-pick'],
    bestFor: 'Japanese anime speech recognition — the ONLY anime-optimized STT model',
  },
  {
    id: 'orpheus-animespeech',
    name: 'Orpheus AnimeSpeech 3B',
    type: 'local',
    qualityRating: 8,
    latency: '1-3 seconds',
    hasVoiceCloning: false,
    languages: ['English'],
    vramRequirement: '3-6GB',
    license: 'Apache 2.0',
    repoUrl: 'https://huggingface.co/taresh18/orpheus-animespeech',
    description:
      'Orpheus 3B (Llama 3.2 base) fine-tuned on 23.7K anime speech samples from ShoukanLabs/AniSpeech. 10 distinct anime voice presets (voice-16 through voice-187). English-focused anime character voice synthesis.',
    tags: ['anime', 'english', 'voice-presets', 'expressive', 'llama-based', 'character-voices'],
    bestFor: 'English anime character voices with 10 selectable voice presets',
  },
  {
    id: 'anime-llasa-3b',
    name: 'Anime Llasa 3B',
    type: 'local',
    qualityRating: 8,
    latency: '1-3 seconds',
    hasVoiceCloning: false,
    languages: ['Japanese'],
    vramRequirement: '3-6GB',
    license: 'CC-BY-NC-4.0',
    repoUrl: 'https://huggingface.co/NandemoGHS/Anime-Llasa-3B',
    description:
      'Llasa 3B (Llama 3.2 base) fine-tuned on 33,000 hours of anime speech including ASMR archives and anime voice datasets. Japanese-focused. 1,240 downloads/month. Enhanced expressiveness specifically tuned for anime character delivery.',
    tags: ['anime', 'japanese', 'expressive', 'llama-based', 'asmr', 'high-training-data'],
    bestFor: 'Japanese anime voice synthesis with massive training data backing',
  },
  {
    id: 'sovits-anime-mini',
    name: 'SoVITS Anime Mini TTS',
    type: 'local',
    qualityRating: 8,
    latency: '1-3 seconds',
    hasVoiceCloning: true,
    languages: ['Japanese'],
    vramRequirement: '4-8GB',
    license: 'MIT',
    repoUrl: 'https://huggingface.co/cpumaxx/SoVITS-anime-mini-tts',
    description:
      'GPT-SoVITS fine-tuned on litagin/moe-speech anime dataset. Japanese voice cloning — give it a 3-10 second clean anime voice clip and it synthesizes new speech in that voice. MIT licensed. Comes with a Firefox screen-reader plugin.',
    tags: ['anime', 'japanese', 'voice-cloning', 'moe-speech', 'gpt-sovits', 'mit'],
    bestFor: 'Japanese anime voice cloning from short reference clips',
  },
  {
    id: 'sovits-anime-female-brickwall',
    name: 'SoVITS Anime Female Brickwall TTS',
    type: 'local',
    qualityRating: 7,
    latency: '1-3 seconds',
    hasVoiceCloning: true,
    languages: ['Japanese'],
    vramRequirement: '4-8GB',
    license: 'MIT',
    repoUrl: 'https://huggingface.co/cpumaxx/SoVITS-anime-female-brickwall-tts',
    description:
      'GPT-SoVITS trained on brickwall-compressed anime female voices (the signature VN/game audio style). Produces that characteristic slightly compressed, punchy anime girl voice. Benefits from Audacity post-processing (treble EQ + noise reduction).',
    tags: ['anime', 'japanese', 'female', 'voice-cloning', 'visual-novel', 'gpt-sovits', 'brickwall'],
    bestFor: 'Visual-novel–style compressed female anime voices',
  },

  // ── New Research Wave: Next-Gen TTS Models ─────────────────────────────

  {
    id: 'hume-tada-3b',
    name: 'Hume TADA 3B',
    type: 'local',
    qualityRating: 9,
    latency: '0.5-2 seconds',
    hasVoiceCloning: true,
    languages: ['English', 'Japanese', 'Chinese', 'Spanish', 'French', 'German', 'Italian', 'Arabic', 'Polish', 'Portuguese'],
    vramRequirement: '4-8GB',
    license: 'MIT',
    repoUrl: 'https://github.com/HumeAI/tada',
    description:
      'Hume AI\'s Text-Acoustic Dual-Alignment model on Llama 3.2 3B. 1:1 token alignment eliminates hallucination. Dynamic prosody per token. Style transfer from reference audio. 10 languages. Near real-time. MIT licensed. This is a paradigm shift in TTS architecture.',
    tags: ['expressive', 'emotion', 'multilingual', 'voice-cloning', 'llama-based', 'top-pick', 'hume', 'mit'],
    bestFor: 'Emotionally expressive multilingual TTS with zero hallucination',
  },
  {
    id: 'dia-1.6b',
    name: 'Dia 1.6B (Dialogue TTS)',
    type: 'local',
    qualityRating: 9,
    latency: '1-3 seconds',
    hasVoiceCloning: true,
    languages: ['English'],
    vramRequirement: '8-10GB',
    license: 'Apache 2.0',
    repoUrl: 'https://github.com/nari-labs/dia',
    description:
      'Nari Labs\' dialogue TTS — generates multi-speaker conversation audio with [S1]/[S2] tags. Supports non-verbal sounds: (laughs), (sighs), (gasps), (coughs), (singing). Voice cloning from reference audio. 44.1kHz output. Perfect for anime dialogue scenes.',
    tags: ['dialogue', 'multi-speaker', 'non-verbal', 'emotion', 'expressive', 'voice-cloning', 'top-pick'],
    bestFor: 'Multi-speaker dialogue with laughter, sighs, and emotional non-verbals',
  },
  {
    id: 'qwen3-tts-custom-voice',
    name: 'Qwen3-TTS 1.7B CustomVoice',
    type: 'local',
    qualityRating: 9,
    latency: '0.1-1 seconds',
    hasVoiceCloning: false,
    languages: ['English', 'Chinese', 'Japanese', 'Korean', 'German', 'French', 'Russian', 'Portuguese', 'Spanish', 'Italian'],
    vramRequirement: '3-6GB',
    license: 'Apache 2.0',
    repoUrl: 'https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice',
    description:
      'Alibaba Qwen3-TTS with 9 pre-designed voice presets (including Ono_Anna — playful Japanese female). 97ms end-to-end streaming latency. Instruction-controlled emotion: tell it "speak angrily" and it does. 10 languages. Apache 2.0.',
    tags: ['multilingual', 'instruction-controlled', 'emotion', 'low-latency', 'streaming', 'voice-presets', 'top-pick'],
    bestFor: 'Ultra-low-latency instruction-controlled emotional TTS with 9 voice presets',
  },
  {
    id: 'voxtral-mini-stt',
    name: 'Voxtral Mini 4B (Realtime STT)',
    type: 'local',
    qualityRating: 9,
    latency: '<500ms',
    hasVoiceCloning: false,
    languages: ['English', 'Japanese', 'Chinese', 'Korean', 'Arabic', 'German', 'Spanish', 'French', 'Hindi', 'Italian', 'Dutch', 'Portuguese', 'Russian'],
    vramRequirement: '8-16GB',
    license: 'Apache 2.0',
    repoUrl: 'https://huggingface.co/mistralai/Voxtral-Mini-4B-Realtime-2602',
    description:
      'Mistral\'s realtime speech-to-text — <500ms latency, 13 languages, streaming architecture with sliding window attention for infinite audio input. Offline-capable. The first open-source realtime STT matching offline accuracy. Apache 2.0.',
    tags: ['stt', 'realtime', 'streaming', 'multilingual', 'mistral', 'low-latency', 'offline'],
    bestFor: 'Realtime multilingual speech recognition with <500ms latency',
  },
  {
    id: 'index-tts-2',
    name: 'IndexTTS-2',
    type: 'local',
    qualityRating: 8,
    latency: '1-3 seconds',
    hasVoiceCloning: true,
    languages: ['English', 'Chinese'],
    vramRequirement: '4-8GB',
    license: 'Apache 2.0',
    repoUrl: 'https://github.com/index-tts/index-tts',
    description:
      'Emotionally expressive zero-shot TTS with duration control. Built on tortoise-tts + XTTSv2 + BigVGAN. Voice cloning without fine-tuning. 15K+ monthly downloads. Industrial-level quality. EN + CN.',
    tags: ['emotion', 'voice-cloning', 'zero-shot', 'duration-control', 'expressive'],
    bestFor: 'Emotionally expressive voice cloning with duration control',
  },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get LLM models that fit within the specified VRAM at Q4 quantization.
 */
export function getModelsForVRAM(vramGB: number): RecommendedLLMModel[] {
  return RECOMMENDED_LLM_MODELS.filter((model) => {
    if (!model.vramRequirements.q4.includes('GB')) return false;
    const requiredGb = parseInt(model.vramRequirements.q4, 10);
    return !Number.isNaN(requiredGb) && requiredGb <= vramGB;
  }).sort((a, b) => b.parameterCount - a.parameterCount);
}

/**
 * Get the top N roleplay models sorted by combined roleplay quality.
 */
export function getTopPicksForRoleplay(count = 5): RecommendedLLMModel[] {
  const sorted = [...RECOMMENDED_LLM_MODELS]
    .filter((m) => m.isUncensored)
    .sort((a, b) => {
      const aScore =
        a.qualityRatings.roleplayImmersion * 2 +
        a.qualityRatings.characterVoice +
        a.qualityRatings.creativeWriting;
      const bScore =
        b.qualityRatings.roleplayImmersion * 2 +
        b.qualityRatings.characterVoice +
        b.qualityRatings.creativeWriting;
      return bScore - aScore;
    });

  return sorted.slice(0, count);
}

/**
 * Get only local TTS options sorted by quality.
 */
export function getLocalTTSRecommendations(): RecommendedTTSModel[] {
  return RECOMMENDED_TTS_MODELS.filter((m) => m.type === 'local').sort((a, b) =>
    b.qualityRating - a.qualityRating
  );
}

/**
 * Get the Ollama pull command for a model by ID.
 */
export function getModelPullCommand(modelId: string): string | undefined {
  const model = RECOMMENDED_LLM_MODELS.find((m) => m.id === modelId);
  return model?.pullCommand;
}

/** Filter models by content maturity rating. */
export function getModelsByContentRating(rating: ContentRating): RecommendedLLMModel[] {
  return RECOMMENDED_LLM_MODELS.filter((m) => m.contentRating === rating);
}

/** Get all mature/NSFW models sorted by roleplay quality. */
export function getMatureModels(): RecommendedLLMModel[] {
  return RECOMMENDED_LLM_MODELS
    .filter((m) => m.contentRating === 'mature')
    .sort((a, b) => b.qualityRatings.roleplayImmersion - a.qualityRatings.roleplayImmersion);
}

/** Get all anime/waifu-focused models. */
export function getAnimeModels(): RecommendedLLMModel[] {
  return RECOMMENDED_LLM_MODELS
    .filter((m) => m.tags.includes('anime') || m.tags.includes('waifu'))
    .sort((a, b) => b.qualityRatings.characterVoice - a.qualityRatings.characterVoice);
}
