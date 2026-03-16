import { create } from 'zustand';
import { useAppStore } from './appStore';

/* ── Types ────────────────────────────────────────────────────────────── */

/** Identifiers for each wizard flow in the app. */
export type WizardId =
  | 'onboarding'
  | 'voice-setup'
  | 'image-gen-setup'
  | 'expression-setup'
  | 'card-import'
  | 'llm-setup'
  | 'whats-new'
  | 'character-gen';

/** A contextual feature tip queued for display. */
export interface FeatureTip {
  /** Unique feature identifier (e.g. 'cinematic_mode', 'mini_games'). */
  id: string;
  title: string;
  description: string;
  icon: string;
  /** Action to execute when the user taps "Try It". */
  action: FeatureTipAction;
}

/** What happens when the user interacts with a feature tip. */
export type FeatureTipAction =
  | { type: 'overlay'; overlay: string }
  | { type: 'shortcut'; key: string }
  | { type: 'wizard'; wizardId: WizardId }
  | { type: 'toggle'; target: string }
  | { type: 'expand-panel'; panel: string };

/* ── State shape ──────────────────────────────────────────────────────── */

interface WizardState {
  /** Currently active wizard, or null if none is open. */
  activeWizard: WizardId | null;
  /** Feature IDs the user has already discovered (persisted in backend config). */
  discoveredFeatures: string[];
  /** Ephemeral queue of tips waiting to be shown. */
  pendingTips: FeatureTip[];
  /** The tip currently being displayed. */
  currentTip: FeatureTip | null;
  /** Last app version the user has seen the "What's New" modal for. */
  lastSeenVersion: string;
  /** Cumulative message count across all sessions (persisted in backend config). */
  totalMessageCount: number;
  /** Number of app sessions (persisted in backend config). */
  sessionCount: number;
  /** Timestamp until which all tips are snoozed, or null. */
  tipsSnoozedUntil: number | null;
  /** Whether the user has permanently hidden all tooltips. */
  tooltipsHidden: boolean;
  /** Whether voice setup wizard has been completed at least once. */
  voiceSetupCompleted: boolean;
  /** Whether image-gen setup wizard has been completed at least once. */
  imageGenSetupCompleted: boolean;

  // ── Actions ──────────────────────────────────────────────────────────

  /** Open a specific wizard by ID. */
  openWizard: (id: WizardId) => void;
  /** Close the currently active wizard. */
  closeWizard: () => void;

  /** Mark a feature as discovered (won't show tips for it again). */
  discoverFeature: (id: string) => void;
  /** Check whether a feature has been discovered. */
  hasDiscovered: (id: string) => boolean;

  /** Add a tip to the pending queue (ignored if already discovered or queued). */
  enqueueTip: (tip: FeatureTip) => void;
  /** Dismiss the current tip and advance the queue. */
  dismissTip: () => void;
  /** Snooze ALL tips for 24 hours + mark current as discovered. */
  snoozeAllTips: () => void;

  /** Increment the total message counter (call after each assistant message). */
  incrementMessageCount: () => void;
  /** Increment the session counter (call once per app load). */
  incrementSessionCount: () => void;

  /**
   * Hydrate wizard state from the backend config object.
   * Called once when the app loads config from the server.
   */
  hydrate: (config: Record<string, unknown>) => void;

  /**
   * Persist wizard-related state back to the backend config.
   * Merges into the existing config via appStore.saveConfig().
   */
  persist: () => Promise<void>;
}

/* ── Store ─────────────────────────────────────────────────────────────── */

export const useWizardStore = create<WizardState>()((set, get) => ({
  // Initial state
  activeWizard: null,
  discoveredFeatures: [],
  pendingTips: [],
  currentTip: null,
  lastSeenVersion: '',
  totalMessageCount: 0,
  sessionCount: 0,
  tipsSnoozedUntil: null,
  tooltipsHidden: false,
  voiceSetupCompleted: false,
  imageGenSetupCompleted: false,

  // ── Wizard lifecycle ─────────────────────────────────────────────────

  openWizard: (id) => set({ activeWizard: id }),

  closeWizard: () => set({ activeWizard: null }),

  // ── Feature discovery ────────────────────────────────────────────────

  discoverFeature: (id) => {
    const { discoveredFeatures } = get();
    if (discoveredFeatures.includes(id)) return;
    const updated = [...discoveredFeatures, id];
    set({ discoveredFeatures: updated });
    // Fire-and-forget persist to backend
    get().persist().catch(() => {});
  },

  hasDiscovered: (id) => get().discoveredFeatures.includes(id),

  // ── Tip queue ────────────────────────────────────────────────────────

  enqueueTip: (tip) => {
    const { discoveredFeatures, pendingTips, currentTip, tooltipsHidden, tipsSnoozedUntil } = get();
    // Skip if tooltips are globally disabled
    if (tooltipsHidden) return;
    // Skip if snoozed
    if (tipsSnoozedUntil && Date.now() < tipsSnoozedUntil) return;
    // Skip if already discovered or already queued
    if (discoveredFeatures.includes(tip.id)) return;
    if (pendingTips.some(t => t.id === tip.id)) return;
    if (currentTip?.id === tip.id) return;

    const updated = [...pendingTips, tip];
    // If no tip is currently shown, pop the first one
    if (!currentTip) {
      set({ pendingTips: updated.slice(1), currentTip: updated[0] });
    } else {
      set({ pendingTips: updated });
    }
  },

  dismissTip: () => {
    const { pendingTips } = get();
    if (pendingTips.length > 0) {
      // Show next tip after a brief delay (handled by the queue component)
      set({ currentTip: null });
      // The queue component will call advanceQueue after 5s spacing
    } else {
      set({ currentTip: null });
    }
  },

  snoozeAllTips: () => {
    const { currentTip } = get();
    const snoozedUntil = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    const updates: Partial<WizardState> = {
      currentTip: null,
      pendingTips: [],
      tipsSnoozedUntil: snoozedUntil,
    };
    // Also mark current tip as discovered
    if (currentTip) {
      const { discoveredFeatures } = get();
      if (!discoveredFeatures.includes(currentTip.id)) {
        updates.discoveredFeatures = [...discoveredFeatures, currentTip.id];
      }
    }
    set(updates);
    get().persist().catch(() => {});
  },

  // ── Counters ─────────────────────────────────────────────────────────

  incrementMessageCount: () => {
    set(s => ({ totalMessageCount: s.totalMessageCount + 1 }));
    // Debounced persist — only persist every 5 messages to avoid excessive writes
    const { totalMessageCount } = get();
    if (totalMessageCount % 5 === 0) {
      get().persist().catch(() => {});
    }
  },

  incrementSessionCount: () => {
    set(s => ({ sessionCount: s.sessionCount + 1 }));
    get().persist().catch(() => {});
  },

  // ── Hydration from backend config ────────────────────────────────────

  hydrate: (config) => {
    set({
      discoveredFeatures: Array.isArray(config.discovered_features)
        ? (config.discovered_features as string[])
        : [],
      lastSeenVersion: typeof config.last_seen_version === 'string'
        ? config.last_seen_version
        : '',
      totalMessageCount: typeof config.wizard_message_count === 'number'
        ? config.wizard_message_count
        : 0,
      sessionCount: typeof config.wizard_session_count === 'number'
        ? config.wizard_session_count
        : 0,
      tipsSnoozedUntil: typeof config.tips_snoozed_until === 'number'
        ? config.tips_snoozed_until
        : null,
      tooltipsHidden: config.tooltips_hidden === true,
      voiceSetupCompleted: config.voice_setup_completed === true,
      imageGenSetupCompleted: config.image_gen_setup_completed === true,
    });
  },

  // ── Persistence to backend config ────────────────────────────────────

  persist: async () => {
    const {
      discoveredFeatures, lastSeenVersion, totalMessageCount,
      sessionCount, tipsSnoozedUntil, tooltipsHidden,
      voiceSetupCompleted, imageGenSetupCompleted,
    } = get();
    const { saveConfig } = useAppStore.getState();
    await saveConfig({
      discovered_features: discoveredFeatures,
      last_seen_version: lastSeenVersion,
      wizard_message_count: totalMessageCount,
      wizard_session_count: sessionCount,
      tips_snoozed_until: tipsSnoozedUntil,
      tooltips_hidden: tooltipsHidden,
      voice_setup_completed: voiceSetupCompleted,
      image_gen_setup_completed: imageGenSetupCompleted,
      onboarding_version: 2,
    } as Record<string, unknown>);
  },
}));
