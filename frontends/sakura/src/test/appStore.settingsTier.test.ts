import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../stores/appStore';

/**
 * Tests for the settingsTier state in appStore.
 *
 * settingsTier replaces the old advancedMode boolean with a 3-tier system:
 *   0 = Normal (default)
 *   1 = Advanced (advancedMode=true, devMode=false)
 *   2 = Developer (advancedMode=true, devMode=true)
 */
describe('appStore — settingsTier', () => {
  beforeEach(() => {
    // Reset to defaults before each test
    useAppStore.setState({
      settingsTier: 0,
      advancedMode: false,
      devMode: false,
    });
  });

  it('defaults to settingsTier 0 with advancedMode=false, devMode=false', () => {
    const s = useAppStore.getState();
    expect(s.settingsTier).toBe(0);
    expect(s.advancedMode).toBe(false);
    expect(s.devMode).toBe(false);
  });

  it('setSettingsTier(1) sets advancedMode=true, devMode=false', () => {
    useAppStore.getState().setSettingsTier(1);
    const s = useAppStore.getState();
    expect(s.settingsTier).toBe(1);
    expect(s.advancedMode).toBe(true);
    expect(s.devMode).toBe(false);
  });

  it('setSettingsTier(2) sets advancedMode=true, devMode=true', () => {
    useAppStore.getState().setSettingsTier(2);
    const s = useAppStore.getState();
    expect(s.settingsTier).toBe(2);
    expect(s.advancedMode).toBe(true);
    expect(s.devMode).toBe(true);
  });

  it('setSettingsTier(0) sets advancedMode=false, devMode=false', () => {
    // Start at tier 2, then drop to 0
    useAppStore.getState().setSettingsTier(2);
    useAppStore.getState().setSettingsTier(0);
    const s = useAppStore.getState();
    expect(s.settingsTier).toBe(0);
    expect(s.advancedMode).toBe(false);
    expect(s.devMode).toBe(false);
  });

  it('toggleAdvancedMode() toggles between tier 0 and 1', () => {
    // 0 → 1
    useAppStore.getState().toggleAdvancedMode();
    let s = useAppStore.getState();
    expect(s.settingsTier).toBe(1);
    expect(s.advancedMode).toBe(true);

    // 1 → 0
    useAppStore.getState().toggleAdvancedMode();
    s = useAppStore.getState();
    expect(s.settingsTier).toBe(0);
    expect(s.advancedMode).toBe(false);
  });

  it('toggleAdvancedMode() at tier 2 drops to tier 0', () => {
    useAppStore.getState().setSettingsTier(2);
    // tier >= 1 is true, so toggle goes to 0
    useAppStore.getState().toggleAdvancedMode();
    const s = useAppStore.getState();
    expect(s.settingsTier).toBe(0);
    expect(s.advancedMode).toBe(false);
    expect(s.devMode).toBe(false);
  });
});
