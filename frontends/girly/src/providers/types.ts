/**
 * Provider capability interfaces.
 *
 * Each AI capability (LLM, STT, TTS, Animation) has its own interface.
 * Concrete providers implement exactly one of these.  The registry maps
 * string names to factory functions that return the concrete instance.
 *
 * Adding a new provider in Phase 2+:
 *   1. Create a class that implements the relevant interface.
 *   2. Register it in registry.ts.
 *   3. Add it to the wizard's provider list for that capability.
 */

import {
  type AnimationContext,
  type AvatarPhase,
  type LLMOptions,
  type LLMMetrics,
  type STTOptions,
  type TTSOptions,
} from '../types/index.ts';

/* ── LLM ─────────────────────────────────────────────────────────── */

/**
 * Interface for any text-generation / chat LLM backend.
 *
 * @example
 *   const llm = registry.getLLM('ollama');
 *   const reply = await llm.chat([{ role: 'user', content: 'hi' }]);
 */
export interface LLMProvider {
  /** Unique identifier matching the string used in ProviderConfig. */
  readonly name: string;
  /** Human-readable display name for the UI. */
  readonly label: string;
  /** True when the provider needs an API key stored via apiKeyService. */
  readonly requiresApiKey: boolean;

  /**
   * Send a chat request and return the assistant's response text.
   *
   * @param messages - Full conversation history (role + content pairs).
   * @param options  - Optional model / token-limit overrides.
   * @returns The assistant's generated text.
   * @throws  On network error, non-200 response, or timeout.
   */
  chat(
    messages: { role: string; content: string }[],
    options?: LLMOptions,
  ): Promise<string>;

  /**
   * Streaming variant of chat().  Yields partial content strings (tokens or
   * token-groups) as they arrive from the provider.  The caller iterates
   * with for-await and renders each chunk incrementally.
   *
   * This method is **optional**.  Providers that do not support streaming
   * simply omit it; the fallback executor detects its absence and falls back
   * to chat(), yielding the full response as a single chunk.
   *
   * Metrics (latency, token counts) are still populated on this.lastMetrics
   * after the stream completes — same as chat().
   *
   * @param messages - Full conversation history (role + content pairs).
   * @param options  - Same model / token-limit overrides as chat().
   * @param signal   - Optional AbortSignal for timeout / cancellation.
   * @yields Each chunk of generated text as it arrives from the API.
   * @throws On network error, non-200 response, or abort.
   */
  chatStream?(
    messages: { role: string; content: string }[],
    options?: LLMOptions,
    signal?: AbortSignal,
  ): AsyncGenerator<string, void, unknown>;

  /**
   * Returns metrics from the most recent chat() call, if available.
   * Providers that don't expose metrics return undefined fields.
   */
  getLastMetrics(): LLMMetrics | undefined;

  /**
   * Attempt a lightweight connectivity check (e.g. GET /api/tags for Ollama).
   *
   * @returns true if the provider is reachable and usable.
   */
  testConnection(): Promise<boolean>;
}

/* ── STT ─────────────────────────────────────────────────────────── */

/** Callback signatures used by STTProvider consumers. */
export type STTResultCallback = (transcript: string) => void;
export type STTErrorCallback  = (error: Error) => void;

/**
 * Interface for speech-to-text / automatic speech recognition providers.
 */
export interface STTProvider {
  readonly name: string;
  readonly label: string;

  /** Returns false when the underlying API is not available in this browser. */
  isSupported(): boolean;

  /**
   * Begin listening for speech input.
   *
   * @param options - Language and other recognition hints.
   * @param onResult - Called with the recognised transcript.
   * @param onError  - Called if recognition encounters an error.
   */
  start(options: STTOptions, onResult: STTResultCallback, onError: STTErrorCallback): void;

  /** Stop the current recognition session (if active). */
  stop(): void;
}

/* ── TTS ─────────────────────────────────────────────────────────── */

/**
 * Interface for text-to-speech providers.
 */
export interface TTSProvider {
  readonly name: string;
  readonly label: string;

  /** Returns false when the underlying API is not available in this browser. */
  isSupported(): boolean;

  /**
   * Speak the given text.  Resolves when the utterance finishes playing.
   *
   * @param text    - The text to synthesise.
   * @param options - Pitch, rate, language overrides.
   * @throws If synthesis fails or is not supported.
   */
  speak(text: string, options?: TTSOptions): Promise<void>;

  /** Cancel any currently playing utterance immediately. */
  cancel(): void;
}

/* ── Animation ───────────────────────────────────────────────────── */

export interface AnimationBonePose {
  rotation: [number, number, number];
  weight?: number;
}

export interface AnimationExpressionState {
  smile: number;
  brows: number;
  blinkRate: number;
  mouthOpen: number;
  mouthSpread: number;
}

export interface AnimationClip {
  phase: AvatarPhase;
  bones: Partial<Record<string, AnimationBonePose>>;
  gaze: { yaw: number; pitch: number };
  expression: AnimationExpressionState;
  idleSway: number;
  breathing: number;
  gestureCycleMs: number;
  reactionDecay: number;
}

/**
 * Interface for context-aware animation generation.
 * Phase 1 ships only PlaceholderAnimationProvider (always returns null).
 */
export interface AnimationProvider {
  readonly name: string;
  readonly label: string;

  /** Returns false if generation is not possible (e.g. no model loaded). */
  isSupported(): boolean;

  /**
   * Generate an animation clip that expresses the given context.
   *
   * @param context - The assistant message and optional emotion.
   * @returns An animation clip, or null if generation is not supported / fails.
   */
  generate(context: AnimationContext): Promise<AnimationClip | null>;
}
