import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFeatureDiscovery } from '../hooks/useFeatureDiscovery';
import { useWizardStore } from '../stores/wizardStore';
import { useAppStore } from '../stores/appStore';
import { useChatStore } from '../stores/chatStore';

/**
 * Tests for useFeatureDiscovery — the hook that triggers contextual
 * feature tips based on message counts, session counts, and idle time.
 *
 * Uses fake timers to control the 30-second idle window.
 */
describe('useFeatureDiscovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();

    // Reset wizard store
    useWizardStore.setState({
      activeWizard: null,
      discoveredFeatures: [],
      pendingTips: [],
      currentTip: null,
      totalMessageCount: 0,
      sessionCount: 0,
      tipsSnoozedUntil: null,
      tooltipsHidden: false,
    });

    // Reset app store with no overlay and a character
    useAppStore.setState({
      activeOverlay: null,
      activeCharacter: { id: 1, name: 'Test', system_prompt: '' } as any,
    });

    // Reset chat store
    useChatStore.setState({
      messages: [],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not enqueue tips when tooltipsHidden is true', () => {
    useWizardStore.setState({ tooltipsHidden: true, totalMessageCount: 100 });
    renderHook(() => useFeatureDiscovery());
    vi.advanceTimersByTime(60_000);
    expect(useWizardStore.getState().currentTip).toBeNull();
  });

  it('does not enqueue tips when a wizard is active', () => {
    useWizardStore.setState({ activeWizard: 'onboarding', totalMessageCount: 100 });
    renderHook(() => useFeatureDiscovery());
    vi.advanceTimersByTime(60_000);
    expect(useWizardStore.getState().currentTip).toBeNull();
  });

  it('enqueues cinematic_mode tip after 1+ messages and idle period', () => {
    useWizardStore.setState({ totalMessageCount: 1 });
    renderHook(() => useFeatureDiscovery());

    // Advance past the 30s idle window
    vi.advanceTimersByTime(31_000);

    expect(useWizardStore.getState().currentTip?.id).toBe('cinematic_mode');
  });

  it('enqueues mini_games tip after 5+ messages and idle period', () => {
    useWizardStore.setState({
      totalMessageCount: 5,
      discoveredFeatures: ['cinematic_mode'], // already discovered earlier tip
    });
    renderHook(() => useFeatureDiscovery());

    vi.advanceTimersByTime(31_000);

    expect(useWizardStore.getState().currentTip?.id).toBe('mini_games');
  });

  it('enqueues knowledge_graph tip at 10+ messages', () => {
    useWizardStore.setState({
      totalMessageCount: 10,
      discoveredFeatures: ['cinematic_mode', 'mini_games'],
    });
    renderHook(() => useFeatureDiscovery());

    vi.advanceTimersByTime(31_000);

    expect(useWizardStore.getState().currentTip?.id).toBe('knowledge_graph');
  });

  it('does not enqueue already-discovered features', () => {
    useWizardStore.setState({
      totalMessageCount: 20,
      discoveredFeatures: ['cinematic_mode', 'mini_games', 'knowledge_graph', 'memory_system', 'lore_editor'],
    });
    renderHook(() => useFeatureDiscovery());

    vi.advanceTimersByTime(31_000);

    // All message-based tips are discovered, so nothing should be queued
    expect(useWizardStore.getState().currentTip).toBeNull();
  });

  it('respects snooze period', () => {
    useWizardStore.setState({
      totalMessageCount: 5,
      tipsSnoozedUntil: Date.now() + 3_600_000, // snoozed for 1 hour
    });
    renderHook(() => useFeatureDiscovery());

    vi.advanceTimersByTime(31_000);

    // enqueueTip should be blocked by snooze
    expect(useWizardStore.getState().currentTip).toBeNull();
  });

  it('does not fire tips when user has an active overlay (other than settings)', () => {
    useWizardStore.setState({ totalMessageCount: 1 });
    useAppStore.setState({ activeOverlay: 'diary' });

    renderHook(() => useFeatureDiscovery());
    vi.advanceTimersByTime(31_000);

    // Active overlay blocks tip display
    expect(useWizardStore.getState().currentTip).toBeNull();
  });

  it('allows tips when the overlay is settings', () => {
    useWizardStore.setState({ totalMessageCount: 1 });
    useAppStore.setState({ activeOverlay: 'settings' });

    renderHook(() => useFeatureDiscovery());
    vi.advanceTimersByTime(31_000);

    expect(useWizardStore.getState().currentTip?.id).toBe('cinematic_mode');
  });

  it('enqueues vn_mode after 3+ sessions', () => {
    useWizardStore.setState({
      sessionCount: 3,
      totalMessageCount: 0, // no message-based tips
    });
    renderHook(() => useFeatureDiscovery());

    vi.advanceTimersByTime(31_000);

    expect(useWizardStore.getState().currentTip?.id).toBe('vn_mode');
  });
});
