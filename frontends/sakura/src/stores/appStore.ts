import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Character, AppConfig, VrmStats } from '../lib/types';
import { api } from '../lib/api';

/** Which section is expanded in the sidebar. */
type SidebarSection = 'chats' | 'characters' | 'create';

/** Controls how many tokens the LLM targets per response. */
export type ReplyLengthMode = 'brief' | 'normal' | 'detailed' | 'auto';
type ChatLayout = 'chat-first' | 'model-first' | 'split';

/**
 * UI density / layout mode.
 * - normal:   full descriptions, standard spacing
 * - compact:  hides field descriptions, tighter spacing
 * - mobile:   hides descriptions + enables touch gestures (swipe-to-archive, etc.)
 */
export type LayoutMode = 'normal' | 'compact' | 'mobile' | 'minimal';

/** Overlay drawers that slide out over the main content. */
type Overlay =
  | 'settings' | 'memory' | 'vocab' | 'diary' | 'stats' | 'timeline' | 'analytics'
  | 'summary' | 'compression'
  | 'search' | 'scenarios'
  | 'replay'
  | 'lore' | 'userknowledge'
  | 'modelbrowser'
  | 'photomode' | 'gallery'
  | 'memorybrowser'
  | 'contextviewer'
  | 'boundaries'
  | 'vocabulary'
  | 'intimatescenarios' | 'desiretree' | 'fantasyjournal'
  | 'milestones' | 'intimatememories' | 'bookmarks'
  | 'intimategallery' | 'loveletter' | 'audiostories'
  | 'intimatequiz' | 'sharedfantasies'
  | 'personapicker' | 'scenereplay'
  | 'bondpanel'
  | 'scenariopicker'
  | 'about'
  | null;

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

  // Overlay drawers (settings, memory, diary, stats, timeline, vocab, summary, schedule, compression)
  activeOverlay: Overlay;
  openOverlay: (overlay: Exclude<Overlay, null>) => void;
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

  /**
   * `null` while loadCharacters has not finished or succeeded; populated with
   * a human-readable error string after all retries fail. UI surfaces this as
   * a banner so users don't mistake an unreachable backend for data loss.
   */
  bootError: string | null;
  /** Manual retry button target — clears bootError, calls loadCharacters again. */
  retryBoot: () => Promise<void>;

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

  // Cinematic mode (B1) — full-screen VN-style immersion
  cinematicMode: boolean;
  toggleCinematicMode: () => void;

  // Visual Novel reader mode (B3) — portrait + text-box layout
  vnMode: boolean;
  toggleVnMode: () => void;

  // Display mode — settings tier: 0=normal, 1=advanced, 2=developer
  settingsTier: 0 | 1 | 2;
  setSettingsTier: (tier: 0 | 1 | 2) => void;
  /** Computed: true when settingsTier >= 2. */
  devMode: boolean;
  advancedMode: boolean;
  /** @deprecated Use setSettingsTier. Kept for backward compatibility. */
  toggleAdvancedMode: () => void;
  layoutMode: LayoutMode;
  setLayoutMode: (mode: LayoutMode) => void;
  /** Computed: true when layoutMode is compact or mobile (hides descriptions). */
  compactMode: boolean;
  /** Computed: true when layoutMode is mobile (enables touch gestures). */
  mobileMode: boolean;
  /** @deprecated Use setLayoutMode. Kept for backward compatibility. */
  toggleCompactMode: () => void;
  /** Toggle between normal/compact and minimal (hide toolbar chrome). */
  toggleMinimalMode: () => void;

  // Scheduled notifications (Feature C)
  scheduledNotifications: ScheduledNotification[];
  unreadNotificationCount: number;
  addScheduledNotification: (n: ScheduledNotification) => void;
  dismissScheduledNotification: (id: string) => void;
  clearScheduledNotifications: () => void;

  // Custom keyboard bindings (#24) — keyed by shortcut description
  customKeyBindings: Record<string, string>;
  /** Override the key for a shortcut by description. Pass empty string to reset to default. */
  setCustomKeyBinding: (description: string, key: string) => void;
  resetCustomKeyBindings: () => void;

  // Reply length / adaptive pacing (#21)
  replyLengthMode: ReplyLengthMode;
  setReplyLengthMode: (mode: ReplyLengthMode) => void;

  // Custom theme palette (#15) — CSS var name → hex color string
  customTheme: Record<string, string>;
  /**
   * Override a single CSS variable in the custom theme palette.
   *
   * @param varName - The CSS custom property name (e.g. '--color-accent').
   * @param value   - The hex color string (e.g. '#e879f9').
   */
  setCustomThemeVar: (varName: string, value: string) => void;
  /** Clear all custom theme overrides, restoring the base data-theme defaults. */
  resetCustomTheme: () => void;

  // VRM runtime performance data (not persisted — reset on page load)
  vrmStats: VrmStats | null;
  setVrmStats: (stats: VrmStats | null) => void;
  viewportFps: number | null;
  setViewportFps: (fps: number | null) => void;

  // Incognito mode — messages are not saved to DB
  incognito: boolean;
  setIncognito: (v: boolean) => void;

  // Settings panel layout: 'drawer' slides over content, 'sidebar' stays left (3D model stays visible)
  settingsMode: 'drawer' | 'sidebar';
  setSettingsMode: (m: 'drawer' | 'sidebar') => void;

  // Soundscape player toggle (controlled from header Music button)
  soundscapeOpen: boolean;
  toggleSoundscape: () => void;

  // Quick-reply chips display preference
  showQuickChips: boolean;
  setShowQuickChips: (v: boolean) => void;

  /**
   * Thinking-indicator render mode shown while the AI is generating a reply.
   *   - 'skeleton': shimmering placeholder lines + dots + elapsed counter (default)
   *   - 'stages':   labelled rows (Reading context / Thinking / Generating)
   *                 driven by SSE-event-derived `stage` field on the message
   */
  thinkingIndicatorMode: 'skeleton' | 'stages';
  setThinkingIndicatorMode: (m: 'skeleton' | 'stages') => void;

  // Bond progression state (polled after each message exchange)
  bondLevel: number;
  bondXp: number;
  bondXpToNext: number;
  bondTier: string;
  bondNextUnlock: { level: number; label: string } | null;
  /** ID of the bond story currently being viewed in the BondStoryViewer overlay. */
  bondStoryId: number | null;
  /** Pending level-up celebration data, consumed by LevelUpCelebration overlay */
  pendingLevelUp: {
    newLevel: number;
    tier: string;
    previousTier: string;
    unlocks: Array<{ type: string; label: string }>;
  } | null;
  /** M6-item21: Pending achievement to display in AchievementToast. */
  pendingAchievement: { key: string; label: string; description: string; icon: string } | null;
  setPendingAchievement: (data: AppState['pendingAchievement']) => void;
  clearPendingAchievement: () => void;
  setBondState: (state: {
    bondLevel: number;
    bondXp: number;
    bondXpToNext: number;
    bondTier: string;
    bondNextUnlock?: { level: number; label: string } | null;
  }) => void;
  setPendingLevelUp: (data: AppState['pendingLevelUp']) => void;
  clearPendingLevelUp: () => void;

  /**
   * Pending memorial scene data, consumed by the MemorialScene overlay.
   * Set by useMemorialScene when the backend returns a pending scene.
   * Cleared after the overlay is dismissed via clearPendingMemorialScene().
   */
  pendingMemorialScene: {
    id: string;
    setting: string;
    beats: string[];
    culmination: string;
    keepsake: string;
  } | null;
  clearPendingMemorialScene: () => void;

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
        // Retry transient failures with exponential backoff. App boot calls
        // this once; if the backend hiccups (transient 500, network blip,
        // worker still starting) the user gets stranded on WelcomeScreen
        // until manual reload. Two retries with 200ms / 600ms backoff is
        // enough to bridge a typical uvicorn restart without delaying boot
        // perceptibly on the happy path. After all retries fail, set
        // `bootError` so the UI can show a banner instead of looking
        // identical to "data was deleted".
        const backoffMs = [200, 600];
        const maxAttempts = backoffMs.length + 1;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            const characters = await api.getCharacters();
            set({ characters, bootError: null });
            return;
          } catch (err) {
            if (attempt === maxAttempts) {
              const msg = err instanceof Error ? err.message : String(err);
              set({ bootError: `Backend unreachable: ${msg}` });
              throw err;
            }
            const delay = backoffMs[attempt - 1];
            console.warn(
              `[appStore] loadCharacters attempt ${attempt}/${maxAttempts} failed:`,
              err,
              `retrying in ${delay}ms`
            );
            await new Promise((r) => setTimeout(r, delay));
          }
        }
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

      bootError: null,
      retryBoot: async () => {
        set({ bootError: null });
        try {
          await get().loadCharacters();
        } catch {
          // loadCharacters already populated bootError; nothing more to do.
        }
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

      // Cinematic mode (B1)
      cinematicMode: false,
      toggleCinematicMode: () => set((s) => ({ cinematicMode: !s.cinematicMode })),

      // Visual Novel reader mode (B3)
      vnMode: false,
      toggleVnMode: () => set((s) => ({ vnMode: !s.vnMode })),

      // Display mode — settings tier: 0=normal, 1=advanced, 2=developer
      settingsTier: 0,
      setSettingsTier: (tier) => set({
        settingsTier: tier,
        advancedMode: tier >= 1,
        devMode: tier >= 2,
      }),
      advancedMode: false,
      devMode: false,
      // Legacy shim: toggle between tier 0 and 1
      toggleAdvancedMode: () => {
        const current = get().settingsTier;
        get().setSettingsTier(current >= 1 ? 0 : 1);
      },
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
      toggleMinimalMode: () => {
        const { layoutMode } = get();
        get().setLayoutMode(layoutMode === 'minimal' ? 'normal' : 'minimal');
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

      // Custom keyboard bindings (#24)
      customKeyBindings: {},
      setCustomKeyBinding: (description, key) => set((s) => {
        const bindings = { ...s.customKeyBindings };
        if (key) {
          bindings[description] = key;
        } else {
          delete bindings[description];
        }
        return { customKeyBindings: bindings };
      }),
      resetCustomKeyBindings: () => set({ customKeyBindings: {} }),

      // Reply length / adaptive pacing (#21)
      replyLengthMode: 'normal',
      setReplyLengthMode: (mode) => set({ replyLengthMode: mode }),

      // Custom theme palette (#15)
      customTheme: {},
      setCustomThemeVar: (varName, value) => set((s) => ({
        customTheme: { ...s.customTheme, [varName]: value },
      })),
      resetCustomTheme: () => set({ customTheme: {} }),

      // VRM runtime performance data (not persisted — reset on page load)
      vrmStats: null,
      setVrmStats: (stats) => set({ vrmStats: stats }),
      viewportFps: null,
      setViewportFps: (fps) => set({ viewportFps: fps }),

      // Incognito mode
      incognito: false,
      setIncognito: (v) => set({ incognito: v }),

      // Settings panel layout
      settingsMode: 'drawer',
      setSettingsMode: (m) => set({ settingsMode: m }),

      // Soundscape player toggle
      soundscapeOpen: false,
      toggleSoundscape: () => set((s) => ({ soundscapeOpen: !s.soundscapeOpen })),

      // Quick-reply chips
      // Session-46 declutter: quick-reply chips break the feeling of organic
      // conversation by spoonfeeding the user canned next-utterances. Default
      // OFF. Toggle back via Settings > General if you actually want them.
      showQuickChips: false,
      setShowQuickChips: (v) => set({ showQuickChips: v }),

      // Thinking indicator render mode (default skeleton)
      thinkingIndicatorMode: 'skeleton',
      setThinkingIndicatorMode: (m) => set({ thinkingIndicatorMode: m }),

      // Bond progression
      bondLevel: 0,
      bondXp: 0,
      bondXpToNext: 150,
      bondTier: 'stranger',
      bondNextUnlock: null,
      pendingLevelUp: null,
      pendingAchievement: null,
      bondStoryId: null,
      setBondState: (state) => set({
        bondLevel: state.bondLevel,
        bondXp: state.bondXp,
        bondXpToNext: state.bondXpToNext,
        bondTier: state.bondTier,
        bondNextUnlock: state.bondNextUnlock ?? null,
      }),
      setPendingLevelUp: (data) => set({ pendingLevelUp: data }),
      clearPendingLevelUp: () => set({ pendingLevelUp: null }),
      setPendingAchievement: (data) => set({ pendingAchievement: data }),
      clearPendingAchievement: () => set({ pendingAchievement: null }),

      pendingMemorialScene: null,
      clearPendingMemorialScene: () => set({ pendingMemorialScene: null }),

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
        settingsTier: s.settingsTier,
        layoutMode: s.layoutMode,
        sidebarCollapsed: s.sidebarCollapsed,
        sidebarSection: s.sidebarSection,
        customKeyBindings: s.customKeyBindings,
        replyLengthMode: s.replyLengthMode,
        customTheme: s.customTheme,
        incognito: s.incognito,
        settingsMode: s.settingsMode,
        showQuickChips: s.showQuickChips,
        thinkingIndicatorMode: s.thinkingIndicatorMode,
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
        // Migrate old advancedMode boolean to settingsTier
        if (p.settingsTier == null && (p as Record<string, unknown>).advancedMode) {
          merged.settingsTier = 1;
          merged.advancedMode = true;
          merged.devMode = false;
        }
        return merged;
      },
    }
  )
);
