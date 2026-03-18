import { useEffect } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useCompanion } from '../../context/CompanionContext.tsx';
import {
  resolveEffectiveThemePreference,
  resolveThemeMode,
} from '../../services/themePresets.ts';

export default function ThemeController() {
  const { state: appState } = useApp();
  const { activePersona } = useCompanion();

  const effectiveThemePreference = resolveEffectiveThemePreference(
    appState.themePreference,
    activePersona?.themePreference,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const resolvedTheme = effectiveThemePreference === 'auto'
        ? (media.matches ? 'dark' : 'light')
        : effectiveThemePreference;
      const resolvedThemeMode = resolveThemeMode(effectiveThemePreference, media.matches);

      document.documentElement.dataset.theme = resolvedTheme;
      document.documentElement.dataset.themeMode = resolvedThemeMode;
      document.documentElement.style.colorScheme = resolvedThemeMode;
    };

    applyTheme();
    media.addEventListener?.('change', applyTheme);

    return () => {
      media.removeEventListener?.('change', applyTheme);
    };
  }, [effectiveThemePreference]);

  return null;
}
