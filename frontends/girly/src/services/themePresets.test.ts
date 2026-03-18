import { describe, expect, it } from 'vitest';
import {
  resolveEffectiveThemePreference,
  resolveThemeMode,
} from './themePresets.ts';

describe('themePresets', () => {
  it('lets a persona override the app default theme', () => {
    expect(resolveEffectiveThemePreference('auto', 'tokyo-night')).toBe('tokyo-night');
    expect(resolveThemeMode(resolveEffectiveThemePreference('auto', 'tokyo-night'), false)).toBe('dark');
  });

  it('falls back to the app default when a persona has no explicit theme', () => {
    expect(resolveEffectiveThemePreference('catppuccin-latte')).toBe('catppuccin-latte');
    expect(resolveThemeMode(resolveEffectiveThemePreference('catppuccin-latte'), true)).toBe('light');
  });

  it('keeps auto behavior when both app and persona follow the system', () => {
    expect(resolveEffectiveThemePreference('auto')).toBe('auto');
    expect(resolveThemeMode(resolveEffectiveThemePreference('auto'), true)).toBe('dark');
    expect(resolveThemeMode(resolveEffectiveThemePreference('auto'), false)).toBe('light');
  });
});
