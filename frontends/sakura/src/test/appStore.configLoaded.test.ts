import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppStore } from '../stores/appStore';
import { api } from '../lib/api';

// Mock the api module
vi.mock('../lib/api', () => ({
  api: {
    getConfig: vi.fn(),
    saveConfig: vi.fn().mockResolvedValue({ ok: true, config: {} }),
    getCharacters: vi.fn().mockResolvedValue([]),
  },
}));

/**
 * Tests for the configLoaded flag that guards the onboarding wizard.
 *
 * Without this flag, the wizard flashes on every page load because config
 * starts as {} (so !config.onboarded is true) until the fetch resolves.
 */
describe('appStore — configLoaded flag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ config: {}, configLoaded: false });
  });

  it('starts with configLoaded=false', () => {
    expect(useAppStore.getState().configLoaded).toBe(false);
  });

  it('loadConfig() sets configLoaded=true after the fetch resolves', async () => {
    vi.mocked(api.getConfig).mockResolvedValue({ onboarded: true } as any);
    await useAppStore.getState().loadConfig();
    expect(useAppStore.getState().configLoaded).toBe(true);
  });

  it('loadConfig() stores the fetched config values', async () => {
    const mockConfig = { onboarded: true, theme: 'dark' };
    vi.mocked(api.getConfig).mockResolvedValue(mockConfig as any);
    await useAppStore.getState().loadConfig();
    expect(useAppStore.getState().config).toMatchObject(mockConfig);
  });

  it('configLoaded stays false if loadConfig() throws', async () => {
    vi.mocked(api.getConfig).mockRejectedValue(new Error('network'));
    await expect(useAppStore.getState().loadConfig()).rejects.toThrow('network');
    expect(useAppStore.getState().configLoaded).toBe(false);
  });

  it('saveConfig() merges patch into existing config', async () => {
    useAppStore.setState({ config: { theme: 'light', onboarded: false } });
    vi.mocked(api.saveConfig).mockResolvedValue({ ok: true, config: {} } as any);
    await useAppStore.getState().saveConfig({ onboarded: true });
    expect(useAppStore.getState().config).toMatchObject({
      theme: 'light',
      onboarded: true,
    });
  });
});
