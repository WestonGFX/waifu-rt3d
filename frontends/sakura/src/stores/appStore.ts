import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Character, AppConfig } from '../lib/types';
import { api } from '../lib/api';

type Tab = 'chats' | 'discover' | 'create' | 'memory' | 'settings';
type ChatLayout = 'chat-first' | 'model-first' | 'split';

interface AppState {
  // Navigation
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;

  // Characters
  characters: Character[];
  activeCharacter: Character | null;
  setActiveCharacter: (char: Character) => void;
  loadCharacters: () => Promise<void>;

  // Config
  config: AppConfig;
  loadConfig: () => Promise<void>;
  saveConfig: (patch: Partial<AppConfig>) => Promise<void>;

  // Layout
  chatLayout: ChatLayout;
  setChatLayout: (layout: ChatLayout) => void;
  modelPanelOpen: boolean;
  toggleModelPanel: () => void;
  memoryPanelOpen: boolean;
  toggleMemoryPanel: () => void;

  // Settings
  advancedMode: boolean;
  toggleAdvancedMode: () => void;
  compactMode: boolean;
  toggleCompactMode: () => void;

  // Chat thread navigation
  inChatThread: boolean;
  openChatThread: (char: Character) => void;
  closeChatThread: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      activeTab: 'chats',
      setActiveTab: (tab) => set({ activeTab: tab }),

      characters: [],
      activeCharacter: null,
      setActiveCharacter: (char) => set({ activeCharacter: char }),
      loadCharacters: async () => {
        const characters = await api.getCharacters();
        set({ characters });
      },

      config: {},
      loadConfig: async () => {
        const config = await api.getConfig();
        set({ config });
      },
      saveConfig: async (patch) => {
        const merged = { ...get().config, ...patch };
        await api.saveConfig(merged);
        set({ config: merged });
      },

      chatLayout: 'chat-first',
      setChatLayout: (layout) => set({ chatLayout: layout }),
      modelPanelOpen: false,
      toggleModelPanel: () => set((s) => ({ modelPanelOpen: !s.modelPanelOpen })),
      memoryPanelOpen: false,
      toggleMemoryPanel: () => set((s) => ({ memoryPanelOpen: !s.memoryPanelOpen })),

      advancedMode: false,
      toggleAdvancedMode: () => set((s) => ({ advancedMode: !s.advancedMode })),
      compactMode: false,
      toggleCompactMode: () => set((s) => ({ compactMode: !s.compactMode })),

      inChatThread: false,
      openChatThread: (char) => set({ activeCharacter: char, inChatThread: true }),
      closeChatThread: () => set({ inChatThread: false })
    }),
    {
      name: 'sakura-app',
      partialize: (s) => ({
        chatLayout: s.chatLayout,
        advancedMode: s.advancedMode,
        compactMode: s.compactMode,
        activeTab: s.activeTab
      })
    }
  )
);
