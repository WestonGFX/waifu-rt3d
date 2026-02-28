import { useEffect, useRef } from 'react';
import { useWizardStore, type FeatureTip } from '../stores/wizardStore';
import { useAppStore } from '../stores/appStore';
import { useChatStore } from '../stores/chatStore';

/* ── Tip definitions ──────────────────────────────────────────────────── */

const TIPS: Record<string, Omit<FeatureTip, 'id'>> = {
  cinematic_mode: {
    title: 'Try Cinematic Mode',
    description: 'Immerse yourself in full-screen roleplay with atmospheric lighting.',
    icon: 'Tv',
    action: { type: 'shortcut', key: 'ctrl+i' },
  },
  mini_games: {
    title: 'Play Games Together',
    description: 'Challenge your character to trivia, hangman, and more mini games.',
    icon: 'Gamepad2',
    action: { type: 'overlay', overlay: 'games' },
  },
  knowledge_graph: {
    title: 'Your AI Is Learning About You',
    description: 'See the facts your character has learned automatically.',
    icon: 'Brain',
    action: { type: 'overlay', overlay: 'userknowledge' },
  },
  memory_system: {
    title: 'Explore Memory Bank',
    description: 'Browse your character\'s short, mid, and long-term memories.',
    icon: 'Brain',
    action: { type: 'overlay', overlay: 'memory' },
  },
  lore_editor: {
    title: 'Build Your World',
    description: 'Write world lore that shapes every conversation.',
    icon: 'BookOpen',
    action: { type: 'overlay', overlay: 'lore' },
  },
  vn_mode: {
    title: 'Try Visual Novel Mode',
    description: 'Read conversations in a portrait + text-box layout.',
    icon: 'BookText',
    action: { type: 'toggle', target: 'vn_mode' },
  },
  expression_portraits: {
    title: 'Generate Expression Art',
    description: 'Create AI-generated emotion artwork for your character.',
    icon: 'Palette',
    action: { type: 'wizard', wizardId: 'expression-setup' },
  },
  model_panel: {
    title: 'See Your 3D Avatar',
    description: 'Expand the right panel to view and interact with the 3D model.',
    icon: 'Monitor',
    action: { type: 'expand-panel', panel: 'model' },
  },
};

/**
 * Hook that triggers contextual feature tips based on user activity.
 *
 * Subscribes to message counts, session counts, and app events.
 * Enqueues tips into the wizard store when trigger conditions are met.
 *
 * Trigger rules:
 * - 1st assistant message → cinematic_mode
 * - 5th total message → mini_games
 * - 10th total message → knowledge_graph
 * - 15th total message → memory_system
 * - 20th total message → lore_editor
 * - 3rd session → vn_mode
 *
 * Tips only appear when the user is idle (30s+ since last message,
 * on welcome screen, or in settings).
 */
export function useFeatureDiscovery() {
  const totalMessageCount = useWizardStore(s => s.totalMessageCount);
  const sessionCount = useWizardStore(s => s.sessionCount);
  const tooltipsHidden = useWizardStore(s => s.tooltipsHidden);
  const activeWizard = useWizardStore(s => s.activeWizard);
  const enqueueTip = useWizardStore(s => s.enqueueTip);
  const hasDiscovered = useWizardStore(s => s.hasDiscovered);

  const lastMessageTimeRef = useRef(Date.now());
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track last message time
  useEffect(() => {
    // Subscribe to chat store messages — update idle timer on new messages
    const unsub = useChatStore.subscribe((state) => {
      if (state.messages.length > 0) {
        lastMessageTimeRef.current = Date.now();
      }
    });
    return unsub;
  }, []);

  // Main discovery logic — runs whenever counters change
  useEffect(() => {
    if (tooltipsHidden || activeWizard) return;

    /**
     * Determine which tips to enqueue based on current thresholds.
     * Tips are only queued if the user is idle (checked via setTimeout).
     */
    const checkTriggers = () => {
      const pendingEnqueue: FeatureTip[] = [];

      // Message-count triggers
      if (totalMessageCount >= 1 && !hasDiscovered('cinematic_mode')) {
        pendingEnqueue.push({ id: 'cinematic_mode', ...TIPS.cinematic_mode });
      }
      if (totalMessageCount >= 5 && !hasDiscovered('mini_games')) {
        pendingEnqueue.push({ id: 'mini_games', ...TIPS.mini_games });
      }
      if (totalMessageCount >= 10 && !hasDiscovered('knowledge_graph')) {
        pendingEnqueue.push({ id: 'knowledge_graph', ...TIPS.knowledge_graph });
      }
      if (totalMessageCount >= 15 && !hasDiscovered('memory_system')) {
        pendingEnqueue.push({ id: 'memory_system', ...TIPS.memory_system });
      }
      if (totalMessageCount >= 20 && !hasDiscovered('lore_editor')) {
        pendingEnqueue.push({ id: 'lore_editor', ...TIPS.lore_editor });
      }

      // Session-count triggers
      if (sessionCount >= 3 && !hasDiscovered('vn_mode')) {
        pendingEnqueue.push({ id: 'vn_mode', ...TIPS.vn_mode });
      }

      // Only enqueue if idle (30+ seconds since last message)
      if (pendingEnqueue.length > 0) {
        const sinceLastMessage = Date.now() - lastMessageTimeRef.current;
        const delay = Math.max(0, 30_000 - sinceLastMessage);

        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        idleTimerRef.current = setTimeout(() => {
          // Re-check that we're still idle and no wizard is active
          const { activeWizard: aw, tooltipsHidden: th } = useWizardStore.getState();
          if (aw || th) return;

          // Also check we're not actively chatting (no active overlay except settings)
          const { activeOverlay, activeCharacter } = useAppStore.getState();
          const isIdleContext = !activeOverlay || activeOverlay === 'settings' || !activeCharacter;

          if (isIdleContext) {
            // Enqueue the first pending tip only (one at a time)
            enqueueTip(pendingEnqueue[0]);
          }
        }, delay);
      }
    };

    checkTriggers();

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [totalMessageCount, sessionCount, tooltipsHidden, activeWizard, enqueueTip, hasDiscovered]);
}
