/**
 * Tests for chatStore Kokoro integration: finalizeKokoroTurn action.
 *
 * Follows testing-conventions.md:
 *   Pattern 1 — store-direct
 *   Pattern 2 — API module mock
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useChatStore } from '../stores/chatStore';
import { useViewerStore } from '../stores/viewerStore';
import { api } from '../lib/api';
import type { KokoroPayload } from '../lib/kokoro';

vi.mock('../lib/api', () => ({
  api: {
    kokoroFinalize: vi.fn(),
  },
}));

function payload(overrides: Partial<KokoroPayload> = {}): KokoroPayload {
  return {
    reply: 'hi',
    innerThought: '',
    emotion: 'neutral',
    facialExpression: 'neutral',
    gesture: 'idle',
    gaze: 'user',
    voiceStyle: 'calm',
    voiceParams: {},
    memoryWrite: { shouldSave: false, summary: '', importance: 0, emotionalSalience: 0 },
    stateDelta: {},
    nsfw: {
      active: false,
      innerArousalShift: null,
      suggestiveBid: null,
      selfConsentCheck: false,
      boundaryReinforcement: false,
    },
    diagnostics: { parseOk: true, bondLevel: 5, kokoroEnabled: true },
    ...overrides,
  };
}

describe('chatStore.finalizeKokoroTurn', () => {
  let originalEmbodiment: ReturnType<typeof useViewerStore.getState>['dispatchKokoroEmbodiment'];
  let embodimentSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store to a known state.
    useChatStore.setState({ charId: 1, sessionId: 100, lastKokoroPayload: null });
    originalEmbodiment = useViewerStore.getState().dispatchKokoroEmbodiment;
    embodimentSpy = vi.fn();
    useViewerStore.setState({
      dispatchKokoroEmbodiment: embodimentSpy as unknown as typeof originalEmbodiment,
    });
  });

  afterEach(() => {
    useViewerStore.setState({ dispatchKokoroEmbodiment: originalEmbodiment });
  });

  it('is a no-op when raw text is empty', async () => {
    await useChatStore.getState().finalizeKokoroTurn('   ');
    expect(api.kokoroFinalize).not.toHaveBeenCalled();
    expect(useChatStore.getState().lastKokoroPayload).toBeNull();
  });

  it('is a no-op when charId is missing', async () => {
    useChatStore.setState({ charId: null, sessionId: 100 });
    await useChatStore.getState().finalizeKokoroTurn('some text');
    expect(api.kokoroFinalize).not.toHaveBeenCalled();
  });

  it('stores payload and dispatches embodiment on success', async () => {
    const p = payload({ emotion: 'happy', facialExpression: 'soft_smile' });
    vi.mocked(api.kokoroFinalize).mockResolvedValueOnce({ ok: true, payload: p });

    await useChatStore.getState().finalizeKokoroTurn('hello there');

    expect(api.kokoroFinalize).toHaveBeenCalledWith(1, 100, 'hello there');
    expect(useChatStore.getState().lastKokoroPayload).toEqual(p);
    expect(embodimentSpy).toHaveBeenCalledWith(p);
  });

  it('does not dispatch embodiment when kokoroEnabled flag is false', async () => {
    const p = payload({
      diagnostics: { parseOk: true, bondLevel: 5, kokoroEnabled: false },
    });
    vi.mocked(api.kokoroFinalize).mockResolvedValueOnce({ ok: true, payload: p });

    await useChatStore.getState().finalizeKokoroTurn('text');

    expect(useChatStore.getState().lastKokoroPayload).toEqual(p);
    expect(embodimentSpy).not.toHaveBeenCalled();
  });

  it('swallows api errors without setting payload', async () => {
    vi.mocked(api.kokoroFinalize).mockRejectedValueOnce(new Error('network'));

    // Should NOT throw — chat must never break.
    await useChatStore.getState().finalizeKokoroTurn('text');

    expect(useChatStore.getState().lastKokoroPayload).toBeNull();
    expect(embodimentSpy).not.toHaveBeenCalled();
  });

  it('ignores responses where ok is false', async () => {
    vi.mocked(api.kokoroFinalize).mockResolvedValueOnce({
      ok: false,
      payload: payload(),
    } as unknown as { ok: boolean; payload: KokoroPayload });

    await useChatStore.getState().finalizeKokoroTurn('text');

    expect(useChatStore.getState().lastKokoroPayload).toBeNull();
    expect(embodimentSpy).not.toHaveBeenCalled();
  });
});
