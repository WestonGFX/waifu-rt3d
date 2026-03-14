import { create } from 'zustand';
import type { Character, AppConfig } from '../lib/types';
import { api } from '../lib/api';

/** LLM brain connection status. */
interface LlmStatus {
  connected: boolean;
  provider: string;
}

interface AppState {
  /** All available characters loaded from the backend. */
  characters: Character[];
  /** Currently selected character, or null when none is active. */
  activeCharacter: Character | null;
  /** App-wide configuration from `/api/config`. */
  config: AppConfig | null;
  /** True once the first `fetchConfig()` call has resolved. */
  configLoaded: boolean;
  /** LLM provider connection status. */
  llmStatus: LlmStatus;

  fetchCharacters: () => Promise<void>;
  setActiveCharacter: (char: Character) => void;
  fetchConfig: () => Promise<void>;
  pollLlmStatus: () => Promise<void>;
}

/**
 * App-level store for the Nova frontend.
 *
 * Manages character list, active character selection, app config,
 * and LLM connectivity status. Forked from Sakura's appStore with
 * all sidebar, overlay, layout, and Sakura-specific UI state removed.
 */
export const useAppStore = create<AppState>()((set) => ({
  characters: [],
  activeCharacter: null,
  config: null,
  configLoaded: false,
  llmStatus: { connected: false, provider: '' },

  fetchCharacters: async () => {
    const characters = await api.getCharacters();
    set({ characters });
  },

  setActiveCharacter: (char) => set({ activeCharacter: char }),

  fetchConfig: async () => {
    const config = await api.getConfig();
    set({ config, configLoaded: true });
  },

  pollLlmStatus: async () => {
    try {
      const stats = await api.getStats();
      const provider = (stats.llm_provider as string) || (stats.provider as string) || '';
      set({ llmStatus: { connected: true, provider } });
    } catch {
      set({ llmStatus: { connected: false, provider: '' } });
    }
  },
}));
