import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Nova UI mode — companion (minimal) or focused (full panels). */
type NovaMode = 'companion' | 'focused';

/** Theme preference — dark, light, or follow system preference. */
type NovaTheme = 'dark' | 'light' | 'system';

/** Side panels available in Focused mode. */
type PanelId = string | null;

interface NovaState {
  /** Current UI mode. Companion is minimal; Focused shows side panels. */
  mode: NovaMode;
  /** Theme preference. Persisted across sessions. */
  theme: NovaTheme;
  /** Which side panel is open in Focused mode, or null for none. */
  activePanel: PanelId;
  /** Whether the command palette overlay is visible. */
  commandPaletteOpen: boolean;

  setMode: (mode: NovaMode) => void;
  toggleMode: () => void;
  setTheme: (theme: NovaTheme) => void;
  setActivePanel: (panel: PanelId) => void;
  toggleCommandPalette: () => void;
}

/**
 * Resolve the effective theme (dark or light) from a preference value.
 * When set to 'system', reads the OS-level prefers-color-scheme media query.
 *
 * @param theme - The user's theme preference.
 * @returns 'dark' or 'light'.
 */
function resolveTheme(theme: NovaTheme): 'dark' | 'light' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}

/**
 * Apply the resolved theme to the document root element.
 * Sets `data-theme` on `<html>` so CSS can target `[data-theme="dark"]` etc.
 *
 * @param theme - The user's theme preference (dark, light, or system).
 */
function applyThemeToDocument(theme: NovaTheme): void {
  document.documentElement.dataset.theme = resolveTheme(theme);
}

/**
 * Nova-specific UI store.
 *
 * Manages Nova's unique UI concerns: companion/focused mode toggle,
 * theme preference with system detection, side panel visibility,
 * and command palette state. Mode and theme are persisted to localStorage.
 */
export const useNovaStore = create<NovaState>()(
  persist(
    (set, get) => ({
      mode: 'companion',
      theme: 'dark',
      activePanel: null,
      commandPaletteOpen: false,

      setMode: (mode) => set({ mode }),

      toggleMode: () => {
        const current = get().mode;
        set({ mode: current === 'companion' ? 'focused' : 'companion' });
      },

      setTheme: (theme) => {
        applyThemeToDocument(theme);
        set({ theme });
      },

      setActivePanel: (panel) => set({ activePanel: panel }),

      toggleCommandPalette: () => {
        set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen }));
      },
    }),
    {
      name: 'nova-ui',
      partialize: (s) => ({
        mode: s.mode,
        theme: s.theme,
      }),
      onRehydrateStorage: () => {
        return (state) => {
          // Apply persisted theme to the document on load
          if (state?.theme) {
            applyThemeToDocument(state.theme);
          }
        };
      },
    }
  )
);
