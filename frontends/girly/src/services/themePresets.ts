import { type ThemePreference } from '../types/index.ts';

export type ThemeMode = 'light' | 'dark';
export type PersonaThemePreference = ThemePreference | 'app-default';

export interface AppThemeOption {
  id: ThemePreference;
  label: string;
  mode: ThemeMode | 'system';
}

export const APP_THEME_OPTIONS: AppThemeOption[] = [
  { id: 'auto', label: 'Auto', mode: 'system' },
  { id: 'light', label: 'Light', mode: 'light' },
  { id: 'dark', label: 'Dark', mode: 'dark' },
  { id: 'catppuccin-latte', label: 'Catppuccin Latte', mode: 'light' },
  { id: 'catppuccin-mocha', label: 'Catppuccin Mocha', mode: 'dark' },
  { id: 'catppuccin-frappe', label: 'Catppuccin Frappe', mode: 'dark' },
  { id: 'tokyo-night', label: 'Tokyo Night', mode: 'dark' },
  { id: 'dracula', label: 'Dracula', mode: 'dark' },
];

const APP_THEME_IDS = new Set(APP_THEME_OPTIONS.map((option) => option.id));

export function isThemePreference(value: string): value is ThemePreference {
  return APP_THEME_IDS.has(value as ThemePreference);
}

export function getThemeOption(themePreference: ThemePreference): AppThemeOption {
  return APP_THEME_OPTIONS.find((option) => option.id === themePreference) ?? APP_THEME_OPTIONS[0];
}

export function getThemeLabel(themePreference: ThemePreference): string {
  return getThemeOption(themePreference).label;
}

export function resolveEffectiveThemePreference(
  appThemePreference: ThemePreference,
  personaThemePreference?: ThemePreference,
): ThemePreference {
  return personaThemePreference ?? appThemePreference;
}

export function resolveThemeMode(themePreference: ThemePreference, prefersDark: boolean): ThemeMode {
  if (themePreference === 'auto') {
    return prefersDark ? 'dark' : 'light';
  }

  const theme = getThemeOption(themePreference);
  return theme?.mode === 'light' ? 'light' : 'dark';
}
