import { describe, expect, it } from 'vitest';
import {
  chunkSpeechText,
  convertGainDbToLinear,
  normalizeSpeechText,
  resolveSpeechChain,
} from './ttsOrchestrationService.ts';

describe('ttsOrchestrationService', () => {
  it('normalizes repeated whitespace without stripping sentence punctuation', () => {
    expect(normalizeSpeechText('Hi   there!\n\nHow are   you?')).toBe('Hi there!\n\nHow are you?');
  });

  it('chunks sentence mode into sentence-aware parts', () => {
    expect(
      chunkSpeechText('One short sentence. Another short sentence! Final line?', 'sentence', 24),
    ).toEqual(['One short sentence.', 'Another short sentence!', 'Final line?']);
  });

  it('keeps provider-default as a single chunk', () => {
    expect(chunkSpeechText('One. Two. Three.', 'provider-default')).toEqual(['One. Two. Three.']);
  });

  it('preserves paragraph chunking boundaries', () => {
    expect(chunkSpeechText('First paragraph.\n\nSecond paragraph.', 'paragraph')).toEqual([
      'First paragraph.',
      'Second paragraph.',
    ]);
  });

  it('resolves playback chain from primary and fallback providers', () => {
    expect(resolveSpeechChain({
      id: 'voice-1',
      label: 'Test',
      mode: 'hybrid',
      primary: { providerId: 'edge-tts', voiceId: 'en-US-JennyNeural' },
      fallbacks: [{ providerId: 'webSpeech', voiceId: 'default' }],
      playbackRate: 1,
      playbackGainDb: 0,
      chunkingMode: 'sentence',
      providerSettings: {},
      defaultForPersonaIds: [],
      createdAt: 1,
      updatedAt: 1,
    }).map((provider) => provider.providerId)).toEqual(['edge-tts', 'webSpeech']);
  });

  it('converts gain db to linear volume', () => {
    expect(convertGainDbToLinear(0)).toBe(1);
    expect(convertGainDbToLinear(6)).toBeGreaterThan(1);
  });
});
