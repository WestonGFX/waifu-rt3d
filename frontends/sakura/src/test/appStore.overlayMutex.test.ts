/**
 * Tests for the overlay mutual-exclusion contract in appStore.
 *
 * Session-46 declutter report flagged: Settings + Memory Browser
 * could both be on-screen at once, squeezing the chat column.
 * Their open state both derives from ``activeOverlay`` so the
 * underlying state machine already enforces "one at a time", but
 * the previous architecture also had a vestigial ``memoryPanelOpen``
 * boolean that bypassed the activeOverlay mutex.
 *
 * These tests lock the mutex contract in regression test form so
 * future refactors can't silently re-introduce parallel side
 * drawers without breaking a test.
 *
 * Follows testing-conventions.md Pattern 1 (Zustand store-direct
 * testing — no React render needed).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../stores/appStore';

beforeEach(() => {
  useAppStore.setState({ activeOverlay: null });
});

describe('appStore overlay mutex', () => {
  it('settings → memorybrowser closes settings', () => {
    useAppStore.getState().openOverlay('settings');
    expect(useAppStore.getState().activeOverlay).toBe('settings');

    useAppStore.getState().openOverlay('memorybrowser');
    expect(useAppStore.getState().activeOverlay).toBe('memorybrowser');
  });

  it('memorybrowser → settings closes memorybrowser', () => {
    useAppStore.getState().openOverlay('memorybrowser');
    expect(useAppStore.getState().activeOverlay).toBe('memorybrowser');

    useAppStore.getState().openOverlay('settings');
    expect(useAppStore.getState().activeOverlay).toBe('settings');
  });

  it('closeOverlay clears the active overlay back to null', () => {
    useAppStore.getState().openOverlay('settings');
    useAppStore.getState().closeOverlay();
    expect(useAppStore.getState().activeOverlay).toBeNull();
  });

  it('openSettingsTab also participates in the mutex', () => {
    // Tab-aware open flow must still close any rival overlay.
    useAppStore.getState().openOverlay('memorybrowser');
    useAppStore.getState().openSettingsTab('character');
    expect(useAppStore.getState().activeOverlay).toBe('settings');
    expect(useAppStore.getState().settingsInitTab).toBe('character');
  });

  it('two side drawers are never both active', () => {
    // Cycle through several side drawers — only the most recent
    // openOverlay call should ever survive in activeOverlay.
    const drawers = ['settings', 'memorybrowser', 'memory', 'analytics', 'diary'] as const;
    for (const d of drawers) {
      useAppStore.getState().openOverlay(d);
      expect(useAppStore.getState().activeOverlay).toBe(d);
    }
  });
});
