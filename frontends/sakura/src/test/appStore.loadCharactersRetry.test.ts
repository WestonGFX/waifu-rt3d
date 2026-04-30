import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAppStore } from '../stores/appStore';
import { api } from '../lib/api';

/**
 * Retry behavior for `appStore.loadCharacters`.
 *
 * Without this retry, a transient backend hiccup (500, network blip,
 * uvicorn restart) at app boot strands the user on `WelcomeScreen` with an
 * empty character list — no UI signal, only manual reload recovers. This
 * caused real support hits during session 19. The fix retries up to twice
 * with 200ms / 600ms backoff before giving up.
 */
vi.mock('../lib/api', () => ({
  api: {
    getCharacters: vi.fn(),
    getConfig: vi.fn().mockResolvedValue({}),
    saveConfig: vi.fn(),
  },
}));

describe('appStore — loadCharacters retry', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ characters: [], bootError: null });
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('happy path — single call sets characters, clears bootError, no warn', async () => {
    const mockChars = [{ id: 1, name: 'Sakura' }];
    vi.mocked(api.getCharacters).mockResolvedValueOnce(mockChars as any);
    useAppStore.setState({ bootError: 'stale prior error' });

    await useAppStore.getState().loadCharacters();

    expect(api.getCharacters).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().characters).toEqual(mockChars);
    expect(useAppStore.getState().bootError).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('retries twice on transient errors then succeeds on third attempt', async () => {
    vi.useFakeTimers();
    const mockChars = [{ id: 2, name: 'Mikazuki' }];
    vi.mocked(api.getCharacters)
      .mockRejectedValueOnce(new Error('GET /api/characters: 500'))
      .mockRejectedValueOnce(new Error('GET /api/characters: 500'))
      .mockResolvedValueOnce(mockChars as any);

    const promise = useAppStore.getState().loadCharacters();

    // First attempt fails immediately, schedules 200ms retry.
    await vi.advanceTimersByTimeAsync(200);
    // Second attempt fails, schedules 600ms retry.
    await vi.advanceTimersByTimeAsync(600);
    // Third attempt succeeds.
    await promise;

    expect(api.getCharacters).toHaveBeenCalledTimes(3);
    expect(useAppStore.getState().characters).toEqual(mockChars);
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('attempt 1/3 failed');
    expect(warnSpy.mock.calls[1]?.[0]).toContain('attempt 2/3 failed');
    vi.useRealTimers();
  });

  it('rethrows after exhausting all retries', async () => {
    vi.useFakeTimers();
    const finalErr = new Error('GET /api/characters: 500');
    vi.mocked(api.getCharacters)
      .mockRejectedValueOnce(new Error('GET /api/characters: 500'))
      .mockRejectedValueOnce(new Error('GET /api/characters: 500'))
      .mockRejectedValueOnce(finalErr);

    const promise = useAppStore.getState().loadCharacters();
    // Surface the rejection so the unhandled-rejection complaint doesn't fire.
    const assertion = expect(promise).rejects.toThrow('GET /api/characters: 500');

    await vi.advanceTimersByTimeAsync(200);
    await vi.advanceTimersByTimeAsync(600);
    await assertion;

    expect(api.getCharacters).toHaveBeenCalledTimes(3);
    expect(useAppStore.getState().characters).toEqual([]); // unchanged
    expect(useAppStore.getState().bootError).toMatch(/Backend unreachable/);
    vi.useRealTimers();
  });

  it('retryBoot clears bootError then re-runs loadCharacters successfully', async () => {
    useAppStore.setState({ bootError: 'Backend unreachable: stale' });
    vi.mocked(api.getCharacters).mockResolvedValueOnce([{ id: 9, name: 'Yuki' }] as any);

    await useAppStore.getState().retryBoot();

    expect(useAppStore.getState().bootError).toBeNull();
    expect(useAppStore.getState().characters).toEqual([{ id: 9, name: 'Yuki' }]);
  });
});
