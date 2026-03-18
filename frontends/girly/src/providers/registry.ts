/**
 * Provider Registry + Fallback Executor.
 *
 * This module is the runtime heart of the provider system.  It does two things:
 *
 *   1. REGISTRY – Maps string provider names to factory functions for each
 *      capability.  Adding a Phase 2 provider is a single line here.
 *
 *   2. FALLBACK EXECUTOR – Given a CapabilityConfig (primary name, fallback
 *      list, trigger conditions, timeout), it attempts the primary provider,
 *      and on failure walks the fallback chain in order until one succeeds
 *      or the chain is exhausted.
 *
 * Consumers (e.g. ChatContext) call the exported helper functions:
 *   executeLLM(messages, config)  → string
 *   executeTTS(text, options, config)  → void
 * These handle the entire try-fallback-throw lifecycle.
 */

import { OllamaLLMProvider }            from './llm/ollama.ts';
import { OpenAILLMProvider }            from './llm/openai.ts';
import { AnthropicLLMProvider }         from './llm/anthropic.ts';
import { GoogleLLMProvider }            from './llm/google.ts';
import { OpenRouterLLMProvider }        from './llm/openrouter.ts';
import { WebSpeechSTTProvider }         from './stt/webSpeech.ts';
import { HelperWhisperSTTProvider }    from './stt/helperWhisper.ts';
import { WebSpeechTTSProvider }         from './tts/webSpeech.ts';
import { HelperCloneTTSProvider }       from './tts/helperClone.ts';
import { HelperTTSProvider }            from './tts/helperTts.ts';
import { PerformanceAnimationProvider } from './animation/performance.ts';
import { PlaceholderAnimationProvider } from './animation/placeholder.ts';

import {
  type LLMProvider,
  type STTProvider,
  type TTSProvider,
  type AnimationProvider,
} from './types.ts';

import {
  type CapabilityConfig,
  type LLMOptions,
  type TTSOptions,
  type ProviderOptionsBag,
} from '../types/index.ts';

/* ── Capability registries (name → singleton instance) ──────────── */

/** LLM providers, keyed by name. */
const llmProviders: Record<string, LLMProvider> = {
  ollama:     new OllamaLLMProvider(),
  openai:     new OpenAILLMProvider(),
  anthropic:  new AnthropicLLMProvider(),
  google:     new GoogleLLMProvider(),
  openrouter: new OpenRouterLLMProvider(),
};

/** STT providers, keyed by name. */
const sttProviders: Record<string, STTProvider> = {
  webSpeech: new WebSpeechSTTProvider(),
  whisper:   new HelperWhisperSTTProvider(),
};

/** TTS providers, keyed by name. */
const ttsProviders: Record<string, TTSProvider> = {
  webSpeech:   new WebSpeechTTSProvider(),
  helperClone: new HelperCloneTTSProvider(),
  'edge-tts':  new HelperTTSProvider('edge-tts', 'Edge TTS', 'en-US-JennyNeural'),
  elevenlabs:  new HelperTTSProvider('elevenlabs', 'ElevenLabs', ''),
  kokoro:      new HelperTTSProvider('kokoro', 'Kokoro', 'af_heart'),
  piper:       new HelperTTSProvider('piper', 'Piper', 'en_US-amy-medium'),
};

/** Animation providers, keyed by name. */
const animationProviders: Record<string, AnimationProvider> = {
  performance: new PerformanceAnimationProvider(),
  placeholder: new PlaceholderAnimationProvider(),
};

/* ── Public registry accessors ──────────────────────────────────── */

/** Returns the named LLM provider, or throws if unknown. */
export function getLLMProvider(name: string): LLMProvider {
  const p = llmProviders[name];
  if (!p) throw new Error(`Unknown LLM provider: "${name}"`);
  return p;
}

/** Returns the named STT provider, or throws if unknown. */
export function getSTTProvider(name: string): STTProvider {
  const p = sttProviders[name];
  if (!p) throw new Error(`Unknown STT provider: "${name}"`);
  return p;
}

/** Returns the named TTS provider, or throws if unknown. */
export function getTTSProvider(name: string): TTSProvider {
  const p = ttsProviders[name];
  if (!p) throw new Error(`Unknown TTS provider: "${name}"`);
  return p;
}

/** Returns the named Animation provider, or throws if unknown. */
export function getAnimationProvider(name: string): AnimationProvider {
  const p = animationProviders[name];
  if (!p) throw new Error(`Unknown Animation provider: "${name}"`);
  return p;
}

/**
 * Update the voice sample ID on the singleton HelperClone TTS provider.
 *
 * Called from the Voice Clone settings UI when the user activates a new
 * sample.  The provider uses this ID on its next speak() call.
 *
 * @param voiceId - Opaque sample ID from voiceCloneService.uploadVoiceSample().
 */
export function setHelperCloneVoiceId(voiceId: string): void {
  (ttsProviders['helperClone'] as HelperCloneTTSProvider).voiceId = voiceId;
}

/**
 * Update the voice ID and optional settings on a helper-backed TTS provider.
 *
 * Called when the user selects a different voice in the Voice Settings panel.
 * The provider uses these values on its next speak() call.
 *
 * @param providerId - Registry key (e.g. 'edge-tts', 'elevenlabs', 'kokoro', 'piper').
 * @param voiceId    - Voice identifier for the provider.
 * @param settings   - Optional per-provider settings (e.g. stability for ElevenLabs).
 */
export function setHelperTTSVoice(
  providerId: string,
  voiceId: string,
  settings?: Record<string, string | number | boolean>,
): void {
  const provider = ttsProviders[providerId];
  if (provider && 'voiceId' in provider) {
    (provider as HelperTTSProvider).voiceId = voiceId;
    if (settings) {
      (provider as HelperTTSProvider).providerSettings = settings;
    }
  }
}

/** Lists all registered LLM provider names (used by the setup wizard). */
export function listLLMProviders(): LLMProvider[] {
  return Object.values(llmProviders);
}

/** Lists all registered STT provider names. */
export function listSTTProviders(): STTProvider[] {
  return Object.values(sttProviders);
}

/** Lists all registered TTS provider names. */
export function listTTSProviders(): TTSProvider[] {
  return Object.values(ttsProviders);
}

/** Lists all registered Animation provider names. */
export function listAnimationProviders(): AnimationProvider[] {
  return Object.values(animationProviders);
}

/* ── Fallback executor helpers ──────────────────────────────────── */

class ProviderTimeoutError extends Error {
  readonly providerName: string;

  constructor(providerName: string, timeoutMs: number) {
    super(`Timed out after ${timeoutMs}ms`);
    this.name = 'ProviderTimeoutError';
    this.providerName = providerName;
  }
}

function normalizeErrorMessage(err: unknown): string {
  if (err instanceof ProviderTimeoutError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

function isTimeoutError(err: unknown): boolean {
  if (err instanceof ProviderTimeoutError) return true;
  if (err instanceof Error && err.name === 'AbortError') return true;
  const message = normalizeErrorMessage(err).toLowerCase();
  return message.includes('timed out');
}

function shouldFallback(config: CapabilityConfig, err: unknown): boolean {
  const timeout = isTimeoutError(err);
  return timeout
    ? config.fallbackTriggers.includes('timeout')
    : config.fallbackTriggers.includes('error');
}

function formatProviderError(name: string, err: unknown): string {
  const kind = isTimeoutError(err) ? 'timeout' : 'error';
  return `[${name}] ${kind}: ${normalizeErrorMessage(err)}`;
}

/**
 * Log provider chain events to help debug fallback behaviour.
 * In production builds these are silent; in dev mode they appear in the console.
 */
function logProviderEvent(
  level: 'info' | 'warn' | 'error',
  capability: string,
  providerName: string,
  message: string,
  extra?: unknown,
): void {
  const prefix = `[AnimeGirly ${capability}] [${providerName}]`;
  const logFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
  if (extra !== undefined) {
    logFn(`${prefix} ${message}`, extra);
  } else {
    logFn(`${prefix} ${message}`);
  }
}

/**
 * Race a promise against a timeout.  Rejects with a TimeoutError if the
 * promise does not resolve/reject within `ms` milliseconds.
 */
function withTimeout<T>(providerName: string, promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  return Promise.race([
    promise.finally(() => {
      if (timer) clearTimeout(timer);
    }),
    new Promise<T>((_, reject) =>
      {
        timer = setTimeout(() => reject(new ProviderTimeoutError(providerName, ms)), ms);
      },
    ),
  ]);
}

/**
 * Execute an LLM chat request with automatic fallback.
 *
 * Tries the primary provider first.  If it throws (and 'error' is in
 * fallbackTriggers) or times out (and 'timeout' is in fallbackTriggers),
 * the next provider in the fallbacks array is attempted.  Repeats until
 * one succeeds or the chain is exhausted.
 *
 * @param messages        - Full conversation history.
 * @param config          - The LLM CapabilityConfig (primary + fallbacks + triggers).
 * @param options         - Optional model / token overrides (highest priority).
 * @param providerOptions - Per-provider stored options (model, baseUrl).
 *                          Merged into options for each provider in the chain
 *                          so each one sees its own persisted model name.
 *                          Explicit `options` fields win on conflict.
 * @returns The assistant's response text.
 * @throws   If every provider in the chain fails.
 *
 * @example
 *   const reply = await executeLLM(
 *     history,
 *     appState.providerConfig.llm,
 *     undefined,
 *     appState.providerConfig.providerOptions,
 *   );
 */
export async function executeLLM(
  messages: { role: string; content: string }[],
  config: CapabilityConfig,
  options?: LLMOptions,
  providerOptions?: Record<string, ProviderOptionsBag>,
): Promise<string> {
  const chain = [config.primary, ...config.fallbacks];
  const errors: string[] = [];

  for (const name of chain) {
    const provider = llmProviders[name];
    if (!provider) {
      errors.push(`LLM provider "${name}" not registered.`);
      logProviderEvent('warn', 'LLM', name, 'Provider not registered, skipping.');
      continue;
    }

    // Merge stored per-provider options (model / baseUrl) with the caller's
    // explicit options.  Caller options take precedence so that one-off
    // overrides still work.
    const storedOpts = providerOptions?.[name];
    const mergedOptions: LLMOptions | undefined = storedOpts || options
      ? { ...storedOpts, ...options }
      : undefined;

    logProviderEvent('info', 'LLM', name, `Attempting chat (timeout: ${config.timeoutMs}ms)...`);

    try {
      const result = await withTimeout(
        name,
        provider.chat(messages, mergedOptions),
        config.timeoutMs,
      );
      logProviderEvent('info', 'LLM', name, `Success (${result.length} chars).`);
      return result;
    } catch (err: unknown) {
      logProviderEvent('warn', 'LLM', name, `Failed: ${normalizeErrorMessage(err)}`);

      // Only fall through if the trigger condition is configured.
      if (!shouldFallback(config, err)) throw err;

      errors.push(formatProviderError(name, err));
      logProviderEvent('info', 'LLM', name, 'Falling back to next provider in chain...');
      // Continue to next provider in chain.
    }
  }

  logProviderEvent('error', 'LLM', 'chain', `All providers exhausted. Errors: ${errors.join('; ')}`);
  // Exhausted the chain.
  throw new Error(
    `LLM provider chain failed:\n  ${errors.join('\n  ')}`,
  );
}

/** Sentinel yielded when a mid-stream failure occurs before the next fallback starts.
 *  The consumer (sendMessage) detects this and resets the assistant message to empty. */
export const STREAM_RESET_SENTINEL = '\x00RESET\x00';

/**
 * Execute an LLM chat request as a stream, with automatic fallback.
 *
 * Mirrors executeLLM's provider-chain logic but adapted for async generators:
 *   - If the provider has chatStream(), iterate it and yield each chunk.
 *   - If chatStream is absent, fall back to chat() and yield the full result
 *     as a single chunk (graceful degradation).
 *   - Mid-stream failure: if a provider throws *after* it has already yielded
 *     at least one token, the STREAM_RESET_SENTINEL is yielded before trying
 *     the next provider, so the UI can wipe the partial text.
 *   - Timeout applies to time-to-first-token only.  An AbortController is
 *     created per provider; its signal is forwarded to fetch() inside
 *     chatStream().  If no chunk arrives within timeoutMs, the fetch is aborted
 *     and the fallback chain continues.
 *
 * @param messages        - Full conversation history.
 * @param config          - The LLM CapabilityConfig (primary + fallbacks + triggers).
 * @param options         - Optional model / token overrides (highest priority).
 * @param providerOptions - Per-provider stored options merged per-provider.
 * @yields Each text chunk from the winning provider's stream.
 * @throws If every provider in the chain fails before yielding anything.
 */
export async function* executeLLMStream(
  messages: { role: string; content: string }[],
  config: CapabilityConfig,
  options?: LLMOptions,
  providerOptions?: Record<string, ProviderOptionsBag>,
): AsyncGenerator<string, void, unknown> {
  const chain  = [config.primary, ...config.fallbacks];
  const errors: string[] = [];

  for (const name of chain) {
    const provider = llmProviders[name];
    if (!provider) {
      errors.push(`LLM provider "${name}" not registered.`);
      logProviderEvent('warn', 'LLM-Stream', name, 'Provider not registered, skipping.');
      continue;
    }

    const storedOpts = providerOptions?.[name];
    const mergedOptions: LLMOptions | undefined = storedOpts || options
      ? { ...storedOpts, ...options }
      : undefined;

    // AbortController scoped to this provider attempt – used for
    // time-to-first-token timeout.
    const controller = new AbortController();
    let firstTokenTimer: ReturnType<typeof setTimeout> | undefined;
    let yieldedAny = false;

    logProviderEvent('info', 'LLM-Stream', name, `Attempting stream (timeout: ${config.timeoutMs}ms)...`);

    try {
      if (provider.chatStream) {
        // ── Streaming path ──
        // Race: if no chunk arrives within timeoutMs, abort the fetch.
        firstTokenTimer = setTimeout(() => controller.abort(new ProviderTimeoutError(name, config.timeoutMs)), config.timeoutMs);

        for await (const chunk of provider.chatStream(messages, mergedOptions, controller.signal)) {
          // First chunk arrived – cancel the timeout; stream is live.
          if (!yieldedAny) {
            clearTimeout(firstTokenTimer);
            firstTokenTimer = undefined;
            yieldedAny = true;
            logProviderEvent('info', 'LLM-Stream', name, 'First token received, stream is live.');
          }
          yield chunk;
        }

        logProviderEvent('info', 'LLM-Stream', name, 'Stream completed successfully.');
        // Stream completed successfully – done, no need to try fallbacks.
        return;
      } else {
        // ── Non-streaming fallback: single-chunk yield ──
        logProviderEvent('info', 'LLM-Stream', name, 'No chatStream method, falling back to single-shot chat().');
        const result = await withTimeout(
          name,
          provider.chat(messages, mergedOptions),
          config.timeoutMs,
        );
        yield result;
        return; // Success.
      }
    } catch (err: unknown) {
      // Clean up timeout if it hasn't fired yet.
      if (firstTokenTimer) clearTimeout(firstTokenTimer);

      logProviderEvent('warn', 'LLM-Stream', name, `Failed: ${normalizeErrorMessage(err)} (yielded tokens: ${yieldedAny})`);

      // Respect fallbackTriggers – only continue the chain when the
      // trigger condition is configured.
      if (!shouldFallback(config, err)) throw err;

      // If we already emitted tokens from this provider, emit the reset
      // sentinel so the UI can clear partial content before the next provider
      // starts writing.
      if (yieldedAny) yield STREAM_RESET_SENTINEL;

      errors.push(formatProviderError(name, err));
      logProviderEvent('info', 'LLM-Stream', name, 'Falling back to next provider in chain...');
      // Continue to next provider in chain.
    }
  }

  logProviderEvent('error', 'LLM-Stream', 'chain', `All providers exhausted. Errors: ${errors.join('; ')}`);
  // Exhausted the chain.
  throw new Error(
    `LLM provider chain failed:\n  ${errors.join('\n  ')}`,
  );
}

/**
 * Execute a TTS speak request with automatic fallback.
 *
 * @param text    - Text to speak.
 * @param options - Pitch / rate / lang overrides.
 * @param config  - The TTS CapabilityConfig.
 */
export async function executeTTS(
  text: string,
  options: TTSOptions,
  config: CapabilityConfig,
): Promise<void> {
  const chain = [config.primary, ...config.fallbacks];
  const errors: string[] = [];

  for (const name of chain) {
    const provider = ttsProviders[name];
    if (!provider) {
      errors.push(`TTS provider "${name}" not registered.`);
      continue;
    }

    if (!provider.isSupported()) {
      if (config.fallbackTriggers.includes('unsupported')) {
        errors.push(`[${name}] Not supported in this browser.`);
        continue;
      }
      throw new Error(`TTS provider "${name}" is not supported.`);
    }

    try {
      await withTimeout(name, provider.speak(text, options), config.timeoutMs);
      return; // Success – stop.
    } catch (err: unknown) {
      if (!shouldFallback(config, err)) throw err;
      errors.push(formatProviderError(name, err));
    }
  }

  // All failed – TTS is best-effort, so we log rather than throw.
  console.warn('[AnimeGirly TTS] All providers failed:', errors.join('; '));
}
