import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ThemeMode = 'sakura' | 'crystal' | 'dark-sakura' | 'dark-crystal';

interface ThemeStore {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggle: () => void;
}

/** Cycle order for the toggle shortcut. */
const CYCLE: ThemeMode[] = ['sakura', 'crystal', 'dark-sakura', 'dark-crystal'];

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
