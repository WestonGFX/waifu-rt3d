import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useWizardStore, type FeatureTip } from '../stores/wizardStore';

/**
 * Tests for the WizardStore — the central state manager for wizard flows,
 * feature discovery, tip queuing, and persistence.
 */

/** Factory for creating a test FeatureTip. */
function makeTip(id: string): FeatureTip {
  return {
    id,
    title: `Tip: ${id}`,
    description: `Description for ${id}`,
    icon: 'Sparkles',
    action: { type: 'overlay', overlay: id },
  };
}

describe('wizardStore', () => {
  beforeEach(() => {
    // Reset to initial state before each test
    useWizardStore.setState({
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
    });
  });

  // ── Wizard lifecycle ────────────────────────────────────────────────

  describe('openWizard / closeWizard', () => {
    it('opens a wizard by ID', () => {
      useWizardStore.getState().openWizard('onboarding');
      expect(useWizardStore.getState().activeWizard).toBe('onboarding');
    });

    it('closes the active wizard', () => {
      useWizardStore.getState().openWizard('voice-setup');
      useWizardStore.getState().closeWizard();
      expect(useWizardStore.getState().activeWizard).toBeNull();
    });

    it('replaces the active wizard when a different one is opened', () => {
      useWizardStore.getState().openWizard('onboarding');
      useWizardStore.getState().openWizard('llm-setup');
      expect(useWizardStore.getState().activeWizard).toBe('llm-setup');
    });
  });

  // ── Feature discovery ───────────────────────────────────────────────

  describe('discoverFeature / hasDiscovered', () => {
    it('marks a feature as discovered', () => {
      useWizardStore.getState().discoverFeature('cinematic_mode');
      expect(useWizardStore.getState().hasDiscovered('cinematic_mode')).toBe(true);
    });

    it('returns false for undiscovered features', () => {
      expect(useWizardStore.getState().hasDiscovered('nonexistent')).toBe(false);
    });

    it('does not duplicate when discovering the same feature twice', () => {
      useWizardStore.getState().discoverFeature('mini_games');
      useWizardStore.getState().discoverFeature('mini_games');
      expect(useWizardStore.getState().discoveredFeatures.filter(f => f === 'mini_games')).toHaveLength(1);
    });
  });

  // ── Tip queue ───────────────────────────────────────────────────────

  describe('enqueueTip', () => {
    it('shows the first enqueued tip immediately as currentTip', () => {
      const tip = makeTip('cinematic_mode');
      useWizardStore.getState().enqueueTip(tip);
      expect(useWizardStore.getState().currentTip).toEqual(tip);
      expect(useWizardStore.getState().pendingTips).toHaveLength(0);
    });

    it('queues subsequent tips without replacing currentTip', () => {
      const tip1 = makeTip('tip_a');
      const tip2 = makeTip('tip_b');
      useWizardStore.getState().enqueueTip(tip1);
      useWizardStore.getState().enqueueTip(tip2);

      expect(useWizardStore.getState().currentTip).toEqual(tip1);
      expect(useWizardStore.getState().pendingTips).toHaveLength(1);
      expect(useWizardStore.getState().pendingTips[0].id).toBe('tip_b');
    });

    it('ignores tips for already-discovered features', () => {
      useWizardStore.getState().discoverFeature('known');
      useWizardStore.getState().enqueueTip(makeTip('known'));
      expect(useWizardStore.getState().currentTip).toBeNull();
      expect(useWizardStore.getState().pendingTips).toHaveLength(0);
    });

    it('ignores duplicate tips already in the queue', () => {
      const tip = makeTip('dup');
      useWizardStore.getState().enqueueTip(tip);
      useWizardStore.getState().enqueueTip(tip);
      // Should have only the one that became currentTip
      expect(useWizardStore.getState().pendingTips).toHaveLength(0);
    });

    it('skips enqueueing when tooltipsHidden is true', () => {
      useWizardStore.setState({ tooltipsHidden: true });
      useWizardStore.getState().enqueueTip(makeTip('should_skip'));
      expect(useWizardStore.getState().currentTip).toBeNull();
    });

    it('skips enqueueing when tips are snoozed', () => {
      useWizardStore.setState({ tipsSnoozedUntil: Date.now() + 60_000 });
      useWizardStore.getState().enqueueTip(makeTip('snoozed'));
      expect(useWizardStore.getState().currentTip).toBeNull();
    });

    it('allows enqueueing after snooze period expires', () => {
      useWizardStore.setState({ tipsSnoozedUntil: Date.now() - 1000 });
      const tip = makeTip('after_snooze');
      useWizardStore.getState().enqueueTip(tip);
      expect(useWizardStore.getState().currentTip).toEqual(tip);
    });
  });

  describe('dismissTip', () => {
    it('clears the current tip', () => {
      useWizardStore.getState().enqueueTip(makeTip('dismissable'));
      useWizardStore.getState().dismissTip();
      expect(useWizardStore.getState().currentTip).toBeNull();
    });
  });

  describe('snoozeAllTips', () => {
    it('clears currentTip and pendingTips, sets snoozedUntil ~24h ahead', () => {
      useWizardStore.getState().enqueueTip(makeTip('a'));
      useWizardStore.getState().enqueueTip(makeTip('b'));

      const before = Date.now();
      useWizardStore.getState().snoozeAllTips();
      const after = Date.now();

      const state = useWizardStore.getState();
      expect(state.currentTip).toBeNull();
      expect(state.pendingTips).toHaveLength(0);
      // tipsSnoozedUntil should be ~24 hours from now
      expect(state.tipsSnoozedUntil).toBeGreaterThanOrEqual(before + 24 * 60 * 60 * 1000 - 100);
      expect(state.tipsSnoozedUntil).toBeLessThanOrEqual(after + 24 * 60 * 60 * 1000 + 100);
    });

    it('marks the current tip as discovered', () => {
      useWizardStore.getState().enqueueTip(makeTip('auto_discover'));
      useWizardStore.getState().snoozeAllTips();
      expect(useWizardStore.getState().discoveredFeatures).toContain('auto_discover');
    });
  });

  // ── Counters ────────────────────────────────────────────────────────

  describe('incrementMessageCount', () => {
    it('increments totalMessageCount by 1', () => {
      useWizardStore.getState().incrementMessageCount();
      expect(useWizardStore.getState().totalMessageCount).toBe(1);
    });

    it('accumulates across multiple calls', () => {
      for (let i = 0; i < 7; i++) useWizardStore.getState().incrementMessageCount();
      expect(useWizardStore.getState().totalMessageCount).toBe(7);
    });
  });

  describe('incrementSessionCount', () => {
    it('increments sessionCount by 1', () => {
      useWizardStore.getState().incrementSessionCount();
      expect(useWizardStore.getState().sessionCount).toBe(1);
    });
  });

  // ── Hydration ───────────────────────────────────────────────────────

  describe('hydrate', () => {
    it('hydrates from a backend config object', () => {
      useWizardStore.getState().hydrate({
        discovered_features: ['cinematic_mode', 'mini_games'],
        last_seen_version: '2.1.0',
        wizard_message_count: 42,
        wizard_session_count: 3,
        tips_snoozed_until: 1700000000000,
        tooltips_hidden: true,
        voice_setup_completed: true,
        image_gen_setup_completed: false,
      });

      const state = useWizardStore.getState();
      expect(state.discoveredFeatures).toEqual(['cinematic_mode', 'mini_games']);
      expect(state.lastSeenVersion).toBe('2.1.0');
      expect(state.totalMessageCount).toBe(42);
      expect(state.sessionCount).toBe(3);
      expect(state.tipsSnoozedUntil).toBe(1700000000000);
      expect(state.tooltipsHidden).toBe(true);
      expect(state.voiceSetupCompleted).toBe(true);
      expect(state.imageGenSetupCompleted).toBe(false);
    });

    it('handles empty/missing config gracefully', () => {
      useWizardStore.getState().hydrate({});

      const state = useWizardStore.getState();
      expect(state.discoveredFeatures).toEqual([]);
      expect(state.lastSeenVersion).toBe('');
      expect(state.totalMessageCount).toBe(0);
      expect(state.sessionCount).toBe(0);
      expect(state.tipsSnoozedUntil).toBeNull();
      expect(state.tooltipsHidden).toBe(false);
    });

    it('rejects non-array discovered_features', () => {
      useWizardStore.getState().hydrate({
        discovered_features: 'not_an_array',
      });
      expect(useWizardStore.getState().discoveredFeatures).toEqual([]);
    });
  });

  // ── Persist ─────────────────────────────────────────────────────────

  describe('persist', () => {
    it('calls saveConfig with the correct shape', async () => {
      // Mock saveConfig on the appStore
      const mockSaveConfig = vi.fn().mockResolvedValue(undefined);
      const { useAppStore } = await import('../stores/appStore');
      const originalSaveConfig = useAppStore.getState().saveConfig;
      useAppStore.setState({ saveConfig: mockSaveConfig });

      try {
        useWizardStore.setState({
          discoveredFeatures: ['test_feature'],
          lastSeenVersion: '2.0.0',
          totalMessageCount: 10,
          sessionCount: 2,
          tipsSnoozedUntil: null,
          tooltipsHidden: false,
          voiceSetupCompleted: true,
          imageGenSetupCompleted: false,
        });

        await useWizardStore.getState().persist();

        expect(mockSaveConfig).toHaveBeenCalledWith({
          discovered_features: ['test_feature'],
          last_seen_version: '2.0.0',
          wizard_message_count: 10,
          wizard_session_count: 2,
          tips_snoozed_until: null,
          tooltips_hidden: false,
          voice_setup_completed: true,
          image_gen_setup_completed: false,
          onboarding_version: 2,
        });
      } finally {
        useAppStore.setState({ saveConfig: originalSaveConfig });
      }
    });
  });
});
