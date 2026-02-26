import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Character, AppConfig } from '../lib/types';
import { api } from '../lib/api';

/** Which section is expanded in the sidebar. */
type SidebarSection = 'chats' | 'characters' | 'create';
type ChatLayout = 'chat-first' | 'model-first' | 'split';

/** Overlay drawers that slide out over the main content. */
type Overlay = 'settings' | 'memory' | null;

/** LLM brain connection status shown in sidebar header. */
interface LlmStatus {
  connected: boolean;
  provider: string;
}

interface AppState {
  // Sidebar
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  sidebarSection: SidebarSection;
  setSidebarSection: (section: SidebarSection) => void;

  // Overlay drawers (settings, memory)
  activeOverlay: Overlay;
  openOverlay: (overlay: 'settings' | 'memory') => void;
  closeOverlay: () => void;
  /** When set, SettingsView opens to this tab on next open. Cleared after use. */
  settingsInitTab: string | null;
  openSettingsTab: (tab: string) => void;

  // LLM status
  llmStatus: LlmStatus;
  pollLlmStatus: () => Promise<void>;

  // Characters
  characters: Character[];
  activeCharacter: Character | null;
  setActiveCharacter: (char: Character) => void;
  selectCharacter: (char: Character) => void;
  loadCharacters: () => Promise<void>;
  deleteCharacter: (id: number) => Promise<void>;

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

  // Legacy compat (kept for components that still reference these)
  activeTab: string;
  setActiveTab: (tab: string) => void;
  inChatThread: boolean;
  openChatThread: (char: Character) => void;
  closeChatThread: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Sidebar
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      sidebarSection: 'chats',
      setSidebarSection: (section) => set({ sidebarSection: section }),

      // Overlay drawers
      activeOverlay: null,
      openOverlay: (overlay) => set({ activeOverlay: overlay }),
      closeOverlay: () => set({ activeOverlay: null }),
      settingsInitTab: null,
      openSettingsTab: (tab) => set({ activeOverlay: 'settings', settingsInitTab: tab }),

      // LLM status — polls /api/stats to detect provider & connectivity
      llmStatus: { connected: false, provider: '' },
      pollLlmStatus: async () => {
        try {
          const stats = await api.getStats();
          const provider = (stats.llm_provider as string) || (stats.provider as string) || '';
          set({ llmStatus: { connected: true, provider } });
        } catch {
          set({ llmStatus: { connected: false, provider: '' } });
        }
      },

      // Characters
      characters: [],
      activeCharacter: null,
      setActiveCharacter: (char) => set({ activeCharacter: char }),
      selectCharacter: (char) => set({ activeCharacter: char, sidebarSection: 'chats' }),
      loadCharacters: async () => {
        const characters = await api.getCharacters();
        set({ characters });
      },
      deleteCharacter: async (id) => {
        await api.deleteCharacter(id);
        const characters = await api.getCharacters();
        // If we just deleted the active character, clear it
        const activeCharacter = get().activeCharacter;
        set({
          characters,
          activeCharacter: activeCharacter?.id === id ? null : activeCharacter,
        });
      },

      // Config
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

      // Layout
      chatLayout: 'chat-first',
      setChatLayout: (layout) => set({ chatLayout: layout }),
      modelPanelOpen: false,
      toggleModelPanel: () => set((s) => ({ modelPanelOpen: !s.modelPanelOpen })),
      memoryPanelOpen: false,
      toggleMemoryPanel: () => set((s) => ({ memoryPanelOpen: !s.memoryPanelOpen })),

      // Settings
      advancedMode: false,
      toggleAdvancedMode: () => set((s) => ({ advancedMode: !s.advancedMode })),
      compactMode: false,
      toggleCompactMode: () => set((s) => ({ compactMode: !s.compactMode })),

      // Legacy compat — maps to new layout for components still using old API
      activeTab: 'chats',
      setActiveTab: (tab) => {
        if (tab === 'settings') set({ activeOverlay: 'settings' });
        else if (tab === 'memory') set({ activeOverlay: 'memory' });
        else set({ sidebarSection: tab as SidebarSection });
      },
      inChatThread: true,
      openChatThread: (char) => set({ activeCharacter: char }),
      closeChatThread: () => set({ activeCharacter: null })
    }),
    {
      name: 'sakura-app',
      partialize: (s) => ({
        chatLayout: s.chatLayout,
        advancedMode: s.advancedMode,
        compactMode: s.compactMode,
        sidebarCollapsed: s.sidebarCollapsed,
        sidebarSection: s.sidebarSection
      })
    }
  )
);
