import { type TTSVoiceProfile } from '../types/companion.ts';

function createVoiceProfile(
  now: number,
  overrides: Partial<TTSVoiceProfile> & Pick<TTSVoiceProfile, 'id' | 'label' | 'primary'>,
): TTSVoiceProfile {
  return {
    id: overrides.id,
    label: overrides.label,
    mode: overrides.mode ?? 'hybrid',
    primary: overrides.primary,
    fallbacks: overrides.fallbacks ?? [{ providerId: 'webSpeech', voiceId: 'default' }],
    playbackRate: overrides.playbackRate ?? 1,
    playbackGainDb: overrides.playbackGainDb ?? 0,
    chunkingMode: overrides.chunkingMode ?? 'sentence',
    providerSettings: overrides.providerSettings ?? {},
    defaultForPersonaIds: overrides.defaultForPersonaIds ?? [],
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

export function getDefaultVoiceProfiles(now = Date.now()): TTSVoiceProfile[] {
  return [
    createVoiceProfile(now, {
      id: 'voice-edge-jenny',
      label: 'Jenny Hybrid',
      primary: { providerId: 'edge-tts', voiceId: 'en-US-JennyNeural' },
      providerSettings: { 'edge-tts': { rate: '+0%', pitch: '+0Hz' } },
      defaultForPersonaIds: ['persona-asami'],
    }),
    createVoiceProfile(now, {
      id: 'voice-edge-aria',
      label: 'Aria Bright',
      primary: { providerId: 'edge-tts', voiceId: 'en-US-AriaNeural' },
      providerSettings: { 'edge-tts': { rate: '+2%', pitch: '+8Hz' } },
      defaultForPersonaIds: ['persona-hina', 'persona-kaila'],
    }),
    createVoiceProfile(now, {
      id: 'voice-edge-sara',
      label: 'Sara Sweetheart',
      primary: { providerId: 'edge-tts', voiceId: 'en-US-SaraNeural' },
      providerSettings: { 'edge-tts': { rate: '-2%', pitch: '+4Hz' } },
      defaultForPersonaIds: ['persona-yui'],
    }),
    createVoiceProfile(now, {
      id: 'voice-edge-sonia',
      label: 'Sonia Velvet',
      primary: { providerId: 'edge-tts', voiceId: 'en-GB-SoniaNeural' },
      providerSettings: { 'edge-tts': { rate: '-4%', pitch: '+2Hz' } },
      defaultForPersonaIds: ['persona-lilia'],
    }),
    createVoiceProfile(now, {
      id: 'voice-edge-natasha',
      label: 'Natasha Starlight',
      primary: { providerId: 'edge-tts', voiceId: 'en-AU-NatashaNeural' },
      providerSettings: { 'edge-tts': { rate: '+1%', pitch: '+6Hz' } },
      defaultForPersonaIds: ['persona-harper'],
    }),
    createVoiceProfile(now, {
      id: 'voice-kokoro-bella',
      label: 'Kokoro Bella Dream',
      primary: { providerId: 'kokoro', voiceId: 'af_bella' },
      providerSettings: { kokoro: { speed: 1 } },
      defaultForPersonaIds: ['persona-reina', 'persona-akari'],
    }),
    createVoiceProfile(now, {
      id: 'voice-kokoro-heart',
      label: 'Kokoro Heart Warm',
      primary: { providerId: 'kokoro', voiceId: 'af_heart' },
      providerSettings: { kokoro: { speed: 1 } },
      defaultForPersonaIds: ['persona-misaki', 'persona-sera'],
    }),
    createVoiceProfile(now, {
      id: 'voice-piper-amy',
      label: 'Piper Amy Cozy',
      primary: { providerId: 'piper', voiceId: 'en_US-amy-medium' },
      providerSettings: { piper: { speaker: 'amy-medium' } },
      defaultForPersonaIds: ['persona-morgan'],
    }),
    createVoiceProfile(now, {
      id: 'voice-web-soft',
      label: 'Soft Browser Fallback',
      mode: 'cloud-only',
      primary: { providerId: 'webSpeech', voiceId: 'default' },
      fallbacks: [],
      playbackRate: 0.92,
      providerSettings: { webSpeech: { pitch: 1.15, rate: 0.92 } },
      defaultForPersonaIds: ['persona-reina'],
    }),
  ];
}
