import type { AppConfig, HudSettings } from '../types';

export const defaultHudSettings: HudSettings = {
  voicePitch: 1,
  creativity: 0.7,
  speechAuto: true
};

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

export function hudSettingsFromConfig(config?: AppConfig | null): HudSettings {
  return {
    voicePitch: clampNumber(config?.tts?.tts_pitch, defaultHudSettings.voicePitch, 0.5, 1.5),
    creativity: clampNumber(config?.llm?.temperature, defaultHudSettings.creativity, 0.1, 1.5),
    speechAuto: typeof config?.ui?.speech_auto === 'boolean' ? config.ui.speech_auto : defaultHudSettings.speechAuto
  };
}

export function hudSettingsToConfigPayload(settings: HudSettings): Partial<AppConfig> {
  return {
    tts: { tts_pitch: settings.voicePitch },
    llm: { temperature: settings.creativity },
    ui: { speech_auto: settings.speechAuto }
  };
}
