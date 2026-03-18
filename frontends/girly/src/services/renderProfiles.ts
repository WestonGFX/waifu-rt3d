import { type RenderProfileId, type RenderSettings } from '../types/companion.ts';

export const DEFAULT_RENDER_SETTINGS: RenderSettings = {
  profile: 'balanced',
  fpsCap: 45,
  pixelRatioCap: 1.25,
  antialias: true,
  orbitSensitivity: 1,
  lipSyncQuality: 'balanced',
  animationQuality: 'balanced',
  hidden2DModeEnabled: false,
};

export const RENDER_PROFILE_LABELS: Record<RenderProfileId, string> = {
  'battery-saver': 'Battery Saver',
  balanced: 'Balanced',
  smooth: 'Smooth',
  'max-fidelity': 'Max Fidelity',
};

export function resolveRenderProfile(profile: RenderProfileId): Partial<RenderSettings> {
  switch (profile) {
    case 'battery-saver':
      return {
        fpsCap: 30,
        pixelRatioCap: 1,
        antialias: false,
        lipSyncQuality: 'low',
        animationQuality: 'low',
      };
    case 'balanced':
      return {
        fpsCap: 45,
        pixelRatioCap: 1.25,
        antialias: true,
        lipSyncQuality: 'balanced',
        animationQuality: 'balanced',
      };
    case 'smooth':
      return {
        fpsCap: 60,
        pixelRatioCap: 1.25,
        antialias: true,
        lipSyncQuality: 'high',
        animationQuality: 'balanced',
      };
    case 'max-fidelity':
      return {
        fpsCap: 60,
        pixelRatioCap: 2,
        antialias: true,
        lipSyncQuality: 'high',
        animationQuality: 'high',
      };
  }
}

export function applyRenderProfile(profile: RenderProfileId): RenderSettings {
  return {
    ...DEFAULT_RENDER_SETTINGS,
    profile,
    ...resolveRenderProfile(profile),
  };
}
