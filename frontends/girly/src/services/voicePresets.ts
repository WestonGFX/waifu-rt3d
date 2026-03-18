/**
 * Voice presets – predefined TTS personality options.
 *
 * Why predefined presets instead of enumerating the system voice list:
 *   The available SpeechSynthesisVoice objects vary wildly across OS and
 *   browser.  Chrome on macOS might expose 50 voices; Firefox on Linux, 2.
 *   Enumerating them creates an unpredictable, confusing UI.
 *
 *   Presets instead tune pitch and rate on whichever default voice the
 *   browser provides, giving a consistent experience everywhere.
 *   The voiceURI is intentionally omitted – we always use the browser default.
 *
 * Adding a new preset is a single entry here; no other code changes needed.
 */

import { type VoicePreset } from '../types/index.ts';

export const VOICE_PRESETS: VoicePreset[] = [
  {
    name: 'default',
    label: 'Default',
    options: { lang: 'en-US', pitch: 1.0, rate: 0.9 },
  },
  {
    name: 'softWhisper',
    label: 'Soft Whisper',
    options: { lang: 'en-US', pitch: 1.4, rate: 0.7 },
  },
  {
    name: 'cheerful',
    label: 'Cheerful',
    options: { lang: 'en-US', pitch: 1.2, rate: 1.1 },
  },
  {
    name: 'calm',
    label: 'Calm',
    options: { lang: 'en-US', pitch: 0.9, rate: 0.8 },
  },
];
