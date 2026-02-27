import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Character, AppConfig } from '../lib/types';
import { api } from '../lib/api';

/** Which section is expanded in the sidebar. */
type SidebarSection = 'chats' | 'characters' | 'create';
type ChatLayout = 'chat-first' | 'model-first' | 'split';

/**
 * UI density / layout mode.
 * - normal:   full descriptions, standard spacing
 * - compact:  hides field descriptions, tighter spacing
 * - mobile:   hides descriptions + enables touch gestures (swipe-to-archive, etc.)
 */
export type LayoutMode = 'normal' | 'compact' | 'mobile';

/** Overlay drawers that slide out over the main content. */
type Overlay = 'settings' | 'memory' | 'vocab' | 'diary' | 'stats' | 'timeline' | null;

/**
 * A pending scheduled character message that the user hasn't seen yet.
 * Created by useSchedulerPoller when the backend reports undelivered proactive messages.
 */
export interface ScheduledNotification {
  /** Locally unique ID (e.g. "sched-42-1709000000000"). */
  id: string;
  /** ID of the character who sent the message. */
  charId: number;
  charName: string;
  charAvatarUrl?: string;
  /** First 80 chars of the message text. */
  preview: string;
  /** Client timestamp when the notification was received. */
  receivedAt: number;
}

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

  // Overlay drawers (settings, memory, diary, stats, timeline, vocab)
  activeOverlay: Overlay;
  openOverlay: (overlay: 'settings' | 'memory' | 'vocab' | 'diary' | 'stats' | 'timeline') => void;
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
  /** True once the first loadConfig() call has resolved (prevents onboarding flash). */
  configLoaded: boolean;
  loadConfig: () => Promise<void>;
  saveConfig: (patch: Partial<AppConfig>) => Promise<void>;

  // Layout
  chatLayout: ChatLayout;
  setChatLayout: (layout: ChatLayout) => void;
  modelPanelOpen: boolean;
  toggleModelPanel: () => void;
  memoryPanelOpen: boolean;
  toggleMemoryPanel: () => void;

  // Display mode
  advancedMode: boolean;
  toggleAdvancedMode: () => void;
  layoutMode: LayoutMode;
  setLayoutMode: (mode: LayoutMode) => void;
  /** Computed: true when layoutMode is compact or mobile (hides descriptions). */
  compactMode: boolean;
  /** Computed: true when layoutMode is mobile (enables touch gestures). */
  mobileMode: boolean;
  /** @deprecated Use setLayoutMode. Kept for backward compatibility. */
  toggleCompactMode: () => void;

  // Scheduled notifications (Feature C)
  scheduledNotifications: ScheduledNotification[];
  unreadNotificationCount: number;
  addScheduledNotification: (n: ScheduledNotification) => void;
  dismissScheduledNotification: (id: string) => void;
  clearScheduledNotifications: () => void;

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
      configLoaded: false,
      loadConfig: async () => {
        const config = await api.getConfig();
        set({ config, configLoaded: true });
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

      // Display mode
      advancedMode: false,
      toggleAdvancedMode: () => set((s) => ({ advancedMode: !s.advancedMode })),
      layoutMode: 'normal',
      setLayoutMode: (mode) => set({
        layoutMode: mode,
        compactMode: mode !== 'normal',
        mobileMode: mode === 'mobile',
      }),
      compactMode: false,
      mobileMode: false,
      toggleCompactMode: () => {
        // Legacy shim: toggles between normal ↔ compact
        const { layoutMode } = get();
        get().setLayoutMode(layoutMode === 'compact' ? 'normal' : 'compact');
      },

      // Scheduled notifications (Feature C)
      scheduledNotifications: [],
      unreadNotificationCount: 0,
      addScheduledNotification: (n) => set((s) => {
        const updated = [...s.scheduledNotifications, n];
        return { scheduledNotifications: updated, unreadNotificationCount: updated.length };
      }),
      dismissScheduledNotification: (id) => set((s) => {
        const updated = s.scheduledNotifications.filter(n => n.id !== id);
        return { scheduledNotifications: updated, unreadNotificationCount: updated.length };
      }),
      clearScheduledNotifications: () => set({ scheduledNotifications: [], unreadNotificationCount: 0 }),

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
        layoutMode: s.layoutMode,
        sidebarCollapsed: s.sidebarCollapsed,
        sidebarSection: s.sidebarSection
      }),
      // Migrate old compactMode: true → layoutMode: 'compact'
      merge: (persisted: unknown, current) => {
        const p = persisted as Partial<AppState & { compactMode?: boolean }>;
        const merged = { ...current, ...p };
        if (!p.layoutMode && p.compactMode) {
          merged.layoutMode = 'compact';
          merged.compactMode = true;
          merged.mobileMode = false;
        }
        return merged;
      },
    }
  )
);
