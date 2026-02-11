import { describe, expect, it } from 'vitest';

import { defaultHudSettings, hudSettingsFromConfig, hudSettingsToConfigPayload } from './settings';

describe('settings mapping', () => {
  it('maps app config to HUD settings with clamping and defaults', () => {
    const settings = hudSettingsFromConfig({
      tts: { tts_pitch: 2.1 },
      llm: { temperature: 0.02 },
      ui: { speech_auto: false }
    });

    expect(settings.voicePitch).toBe(1.5);
    expect(settings.creativity).toBe(0.1);
    expect(settings.speechAuto).toBe(false);
  });

  it('falls back when config keys are missing', () => {
    const settings = hudSettingsFromConfig({});
    expect(settings).toEqual(defaultHudSettings);
  });

  it('converts HUD settings to /api/config payload shape', () => {
    const payload = hudSettingsToConfigPayload({
      voicePitch: 1.2,
      creativity: 0.9,
      speechAuto: true
    });

    expect(payload).toEqual({
      tts: { tts_pitch: 1.2 },
      llm: { temperature: 0.9 },
      ui: { speech_auto: true }
    });
  });
});
