import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Nova UI mode — companion (minimal) or focused (full panels). */
type NovaMode = 'companion' | 'focused';

/** Theme preference — dark, light, or follow system preference. */
type NovaTheme = 'dark' | 'light' | 'system';

/** Side panels available in Focused mode. */
type PanelId = string | null;

/** Shape of a single toast notification. */
interface NovaToast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface NovaState {
  /** Current UI mode. Companion is minimal; Focused shows side panels. */
  mode: NovaMode;
  /** Theme preference. Persisted across sessions. */
  theme: NovaTheme;
  /** Which side panel is open in Focused mode, or null for none. */
  activePanel: PanelId;
  /** Whether the command palette overlay is visible. */
  commandPaletteOpen: boolean;
  /** Active toast notifications (max 3, ephemeral — not persisted). */
  toasts: NovaToast[];

  setMode: (mode: NovaMode) => void;
  toggleMode: () => void;
  setTheme: (theme: NovaTheme) => void;
  setActivePanel: (panel: PanelId) => void;
  toggleCommandPalette: () => void;
  /** Add a toast notification. Auto-dismisses after 3 seconds. Max 3 visible. */
  addToast: (message: string, type: 'success' | 'error' | 'info') => void;
  /** Manually remove a toast by ID. */
  removeToast: (id: string) => void;
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
      toasts: [],

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

      addToast: (message, type) => {
        const id = crypto.randomUUID();
        set((s) => ({
          toasts: [...s.toasts.slice(-2), { id, message, type }], // max 3
        }));
        setTimeout(() => {
          set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
        }, 3000);
      },

      removeToast: (id) =>
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
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
