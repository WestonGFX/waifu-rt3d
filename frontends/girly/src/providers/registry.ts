/**
 * Provider Registry — waifu-rt3d adapter.
 *
 * Replaces direct LLM provider calls with waifu-rt3d backend streaming.
 * Maintains the same exported interface so ChatContext.tsx works unchanged.
 *
 * Original registry instantiated 5 LLM providers + TTS/STT/Animation providers
 * and ran a fallback chain locally. This replacement routes all LLM calls
 * through the backend's /api/chat/stream SSE endpoint.
 */

import { WebSpeechSTTProvider } from './stt/webSpeech.ts';
import { WebSpeechTTSProvider } from './tts/webSpeech.ts';
import { PerformanceAnimationProvider } from './animation/performance.ts';

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

/* ── Waifu-rt3d session context (set by CompanionContext bridge) ── */

let _currentSessionId: number | null = null;
let _currentCharacterId: number | null = null;

/**
 * Set the active waifu-rt3d session and character IDs.
 * Called from CompanionContext whenever the thread/persona changes.
 */
export function setWaifuContext(sessionId: number | null, characterId: number | null): void {
  _currentSessionId = sessionId;
  _currentCharacterId = characterId;
}

/** Returns the current waifu-rt3d session ID (for bridging code). */
export function getWaifuSessionId(): number | null {
  return _currentSessionId;
}

/** Returns the current waifu-rt3d character ID (for bridging code). */
export function getWaifuCharacterId(): number | null {
  return _currentCharacterId;
}

/* ── Sentinel for stream resets ── */

export const STREAM_RESET_SENTINEL = '\x00RESET\x00';

/* ── Stub provider registries (kept for imports that reference them) ── */

const webSpeechSTT = new WebSpeechSTTProvider();
const webSpeechTTS = new WebSpeechTTSProvider();
const performanceAnimation = new PerformanceAnimationProvider();

/**
 * Returns a stub LLM provider. Original threw on unknown names.
 * Now returns a minimal object since the backend handles all LLM work.
 */
export function getLLMProvider(_name: string): LLMProvider {
  return {
    name: 'waifu-rt3d',
    label: 'waifu-rt3d Backend',
    requiresApiKey: false,
    chat: async () => '',
    testConnection: async () => true,
    getLastMetrics: () => null,
  } as unknown as LLMProvider;
}

/** Returns the named STT provider, or throws if unknown. */
export function getSTTProvider(_name: string): STTProvider {
  return webSpeechSTT;
}

/** Returns the named TTS provider, or throws if unknown. */
export function getTTSProvider(_name: string): TTSProvider {
  return webSpeechTTS;
}

/** Returns the named Animation provider, or throws if unknown. */
export function getAnimationProvider(_name: string): AnimationProvider {
  return performanceAnimation;
}

/** Stub — no longer needed when backend manages voice clones. */
export function setHelperCloneVoiceId(_voiceId: string): void {}

/** Stub — no longer needed when backend manages TTS voices. */
export function setHelperTTSVoice(
  _providerId: string,
  _voiceId: string,
  _settings?: Record<string, string | number | boolean>,
): void {}

/** Lists all registered LLM provider names. */
export function listLLMProviders(): LLMProvider[] {
  return [getLLMProvider('waifu-rt3d')];
}

/** Lists all registered STT provider names. */
export function listSTTProviders(): STTProvider[] {
  return [webSpeechSTT];
}

/** Lists all registered TTS provider names. */
export function listTTSProviders(): TTSProvider[] {
  return [webSpeechTTS];
}

/** Lists all registered Animation provider names. */
export function listAnimationProviders(): AnimationProvider[] {
  return [performanceAnimation];
}

/* ── LLM execution via waifu-rt3d backend ── */

/**
 * Execute an LLM chat request (non-streaming) via waifu-rt3d backend.
 *
 * @param messages - Full conversation history (only last user msg is sent).
 * @param _config - Ignored — backend handles provider selection.
 * @param _options - Ignored.
 * @param _providerOptions - Ignored.
 * @returns The assistant's response text.
 */
export async function executeLLM(
  messages: { role: string; content: string }[],
  _config: CapabilityConfig,
  _options?: LLMOptions,
  _providerOptions?: Record<string, ProviderOptionsBag>,
): Promise<string> {
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUserMsg || !_currentSessionId || !_currentCharacterId) {
    throw new Error('No active session or user message');
  }

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: lastUserMsg.content,
      session_id: _currentSessionId,
      character_id: _currentCharacterId,
    }),
  });

  if (!response.ok) {
    throw new Error(`Chat request failed: ${response.status}`);
  }

  const data = await response.json() as { reply?: string };
  return data.reply ?? '';
}

/**
 * Execute an LLM chat request as a stream via waifu-rt3d backend SSE.
 *
 * Yields text chunks matching the original generator interface that
 * ChatContext expects. Parses SSE events from /api/chat/stream.
 *
 * @param messages - Full conversation history.
 * @param _config - Ignored — backend handles provider selection.
 * @param _options - Ignored.
 * @param _providerOptions - Ignored.
 * @yields Each text chunk from the backend's SSE stream.
 */
export async function* executeLLMStream(
  messages: { role: string; content: string }[],
  _config: CapabilityConfig,
  _options?: LLMOptions,
  _providerOptions?: Record<string, ProviderOptionsBag>,
): AsyncGenerator<string, void, unknown> {
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUserMsg || !_currentSessionId || !_currentCharacterId) {
    throw new Error('No active session or user message');
  }

  const response = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: lastUserMsg.content,
      session_id: _currentSessionId,
      character_id: _currentCharacterId,
      speak: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Stream request failed: ${response.status}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop()!;

    for (const eventBlock of events) {
      if (!eventBlock.trim()) continue;
      const lines = eventBlock.split('\n');
      let eventType = '';
      let eventData = '';

      for (const line of lines) {
        if (line.startsWith('event: ')) eventType = line.slice(7).trim();
        else if (line.startsWith('data: ')) eventData = line.slice(6);
      }

      if (!eventData) continue;
      try {
        const data = JSON.parse(eventData);
        switch (eventType) {
          case 'token':
            yield data.t;
            break;
          case 'done':
            // Final — ChatContext uses accumulated text
            break;
          case 'error':
            throw new Error(data.error || 'Stream error');
          case 'stream_reset':
            yield STREAM_RESET_SENTINEL;
            break;
        }
      } catch (e) {
        if (e instanceof Error && e.message === 'Stream error') throw e;
        console.warn('[Registry SSE] Parse error:', e);
      }
    }
  }
}

/**
 * Execute a TTS speak request. Falls back to WebSpeech only.
 */
export async function executeTTS(
  text: string,
  options: TTSOptions,
  _config: CapabilityConfig,
): Promise<void> {
  try {
    if (webSpeechTTS.isSupported()) {
      await webSpeechTTS.speak(text, options);
    }
  } catch {
    console.warn('[Girly TTS] WebSpeech failed');
  }
}
