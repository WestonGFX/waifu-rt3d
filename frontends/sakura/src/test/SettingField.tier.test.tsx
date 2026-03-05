import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SettingField } from '../components/SettingField';
import { useAppStore } from '../stores/appStore';

/**
 * Tests for SettingField tier-based visibility gating.
 *
 * The `tier` prop (0=normal, 1=advanced, 2=dev) controls when a setting
 * appears. The legacy `advanced` boolean maps to tier=1 for backward compat.
 */
describe('SettingField — tier visibility', () => {
  beforeEach(() => {
    useAppStore.setState({ settingsTier: 0, advancedMode: false, devMode: false, layoutMode: 'normal' });
  });

  it('renders tier=0 settings at any tier level', () => {
    render(<SettingField label="Basic Setting" tier={0}><input /></SettingField>);
    expect(screen.getByText('Basic Setting')).toBeTruthy();
  });

  it('hides tier=1 settings when settingsTier=0', () => {
    const { container } = render(<SettingField label="Advanced Setting" tier={1}><input /></SettingField>);
    expect(container.innerHTML).toBe('');
  });

  it('shows tier=1 settings when settingsTier=1', () => {
    useAppStore.setState({ settingsTier: 1, advancedMode: true, devMode: false });
    render(<SettingField label="Advanced Setting" tier={1}><input /></SettingField>);
    expect(screen.getByText('Advanced Setting')).toBeTruthy();
  });

  it('hides tier=2 settings when settingsTier=1', () => {
    useAppStore.setState({ settingsTier: 1, advancedMode: true, devMode: false });
    const { container } = render(<SettingField label="Dev Setting" tier={2}><input /></SettingField>);
    expect(container.innerHTML).toBe('');
  });

  it('shows tier=2 settings when settingsTier=2', () => {
    useAppStore.setState({ settingsTier: 2, advancedMode: true, devMode: true });
    render(<SettingField label="Dev Setting" tier={2}><input /></SettingField>);
    expect(screen.getByText('Dev Setting')).toBeTruthy();
  });

  it('backward compat: advanced={true} maps to tier=1', () => {
    // Hidden at tier 0
    const { container, unmount } = render(<SettingField label="Legacy Advanced" advanced><input /></SettingField>);
    expect(container.innerHTML).toBe('');
    unmount();

    // Shown at tier 1
    useAppStore.setState({ settingsTier: 1, advancedMode: true, devMode: false });
    render(<SettingField label="Legacy Advanced" advanced><input /></SettingField>);
    expect(screen.getByText('Legacy Advanced')).toBeTruthy();
  });

  it('no tier prop and no advanced prop → always visible', () => {
    render(<SettingField label="Always Visible"><input /></SettingField>);
    expect(screen.getByText('Always Visible')).toBeTruthy();
  });

  it('explicit tier prop overrides advanced prop', () => {
    // tier=2 with advanced=true → tier=2 wins
    useAppStore.setState({ settingsTier: 1, advancedMode: true, devMode: false });
    const { container } = render(<SettingField label="Dev Override" tier={2} advanced><input /></SettingField>);
    expect(container.innerHTML).toBe('');
  });
});
