import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode =
  | 'sakura' | 'crystal' | 'dark-sakura' | 'dark-crystal'
  | 'matcha' | 'lavender' | 'peach' | 'midnight'
  | 'bubblegum' | 'blurple' | 'catppuccin-latte' | 'catppuccin-macchiato';

interface ThemeStore {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggle: () => void;
}

/** Cycle order for the toggle shortcut (light themes first, then dark). */
const CYCLE: ThemeMode[] = [
  'sakura', 'crystal', 'catppuccin-latte', 'matcha', 'lavender', 'peach', 'bubblegum',
  'dark-sakura', 'dark-crystal', 'midnight', 'blurple', 'catppuccin-macchiato',
];

export const useTheme = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: 'sakura',
      setTheme: (theme) => {
        document.documentElement.setAttribute('data-theme', theme);
        set({ theme });
      },
      toggle: () =>
        set((state) => {
          const idx = CYCLE.indexOf(state.theme);
          const next = CYCLE[(idx + 1) % CYCLE.length];
          document.documentElement.setAttribute('data-theme', next);
          return { theme: next };
        })
    }),
    { name: 'sakura-theme' }
  )
);
