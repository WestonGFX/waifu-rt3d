/**
 * Tests for the DART gap-fill gesture wiring in viewerStore (Stage 3 Phase 5.1).
 *
 * Covers:
 *   1. dispatchDartGesture — load-then-play clip protocol + VRM-only gating.
 *   2. dispatchKokoroEmbodiment Step 4 — emotion-driven gap-fill: fires on an
 *      expressive emotion when there is no explicit gesture, skips when an
 *      explicit gesture is present or the emotion is unmapped, and respects the
 *      throttle cooldown.
 *
 * The viewerStore module holds throttle counters at module scope, so each test
 * re-imports the store fresh (vi.resetModules) for deterministic cooldown state.
 * Follows testing-conventions.md Pattern 1 (store-direct).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DART_GESTURE_COOLDOWN_TURNS } from '../lib/dartGestures';
import type { KokoroPayload } from '../lib/kokoro';

type ViewerStore = typeof import('../stores/viewerStore')['useViewerStore'];

let useViewerStore: ViewerStore;

beforeEach(async () => {
  vi.resetModules();
  ({ useViewerStore } = await import('../stores/viewerStore'));
});

/** Fake iframe whose contentWindow.postMessage is a spy (matches viewerStore.test). */
function makeFakeIframe(): { el: HTMLIFrameElement; spy: ReturnType<typeof vi.fn> } {
  const spy = vi.fn();
  const el = { contentWindow: { postMessage: spy } } as unknown as HTMLIFrameElement;
  return { el, spy };
}

function payload(overrides: Partial<KokoroPayload> = {}): KokoroPayload {
  return {
    reply: 'hi',
    innerThought: '',
    emotion: 'neutral',
    facialExpression: 'neutral',
    gesture: 'idle',
    gaze: 'user',
    voiceStyle: 'warm',
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

describe('viewerStore.dispatchDartGesture', () => {
  it('loads then plays a gesture clip (first use loads + plays, next use plays only)', () => {
    const { el, spy } = makeFakeIframe();
    useViewerStore.setState({ iframeRef: el });

    useViewerStore.getState().dispatchDartGesture('cheer');
    // First use: loadAnimation + playAnimation.
    expect(spy).toHaveBeenCalledTimes(2);
    const [loadMsg] = spy.mock.calls[0];
    expect(loadMsg.type).toBe('loadAnimation');
    expect(loadMsg.payload.url).toBe('/files/animations/dart-gestures/cheer.glb');
    expect(loadMsg.payload.name).toBe('dart_cheer');
    expect(loadMsg.payload.retarget).toBe(true);
    const [playMsg] = spy.mock.calls[1];
    expect(playMsg.type).toBe('playAnimation');
    expect(playMsg.payload.name).toBe('dart_cheer');

    spy.mockClear();
    useViewerStore.getState().dispatchDartGesture('cheer');
    // Second use: clip already loaded → playAnimation only.
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].type).toBe('playAnimation');
  });

  it('is a no-op outside VRM mode', () => {
    const { el, spy } = makeFakeIframe();
    useViewerStore.setState({ iframeRef: el, mode: 'live2d' });
    useViewerStore.getState().dispatchDartGesture('cheer');
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('viewerStore.dispatchKokoroEmbodiment — DART gap-fill (Step 4)', () => {
  let dartSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const original = useViewerStore.getState().dispatchDartGesture;
    dartSpy = vi.fn();
    useViewerStore.setState({
      dispatchDartGesture: dartSpy as unknown as typeof original,
    });
  });

  it('fires a gap-fill gesture on an expressive emotion when gesture is idle', () => {
    useViewerStore.getState().dispatchKokoroEmbodiment(
      payload({ emotion: 'excited', gesture: 'idle' }),
    );
    expect(dartSpy).toHaveBeenCalledTimes(1);
    expect(dartSpy).toHaveBeenCalledWith('cheer');
  });

  it('does NOT fire when the LLM picked an explicit gesture', () => {
    useViewerStore.getState().dispatchKokoroEmbodiment(
      payload({ emotion: 'excited', gesture: 'wave' }),
    );
    expect(dartSpy).not.toHaveBeenCalled();
  });

  it('does NOT fire for an unmapped (gentle) emotion', () => {
    useViewerStore.getState().dispatchKokoroEmbodiment(
      payload({ emotion: 'happy', gesture: 'idle' }),
    );
    expect(dartSpy).not.toHaveBeenCalled();
  });

  it('is a no-op when kokoro is disabled', () => {
    useViewerStore.getState().dispatchKokoroEmbodiment(
      payload({
        emotion: 'excited',
        gesture: 'idle',
        diagnostics: { parseOk: true, bondLevel: 5, kokoroEnabled: false },
      }),
    );
    expect(dartSpy).not.toHaveBeenCalled();
  });

  it('throttles consecutive expressive turns to ~1 per cooldown', () => {
    const turns = DART_GESTURE_COOLDOWN_TURNS * 3; // 9 with cooldown=3
    for (let i = 0; i < turns; i++) {
      useViewerStore.getState().dispatchKokoroEmbodiment(
        payload({ emotion: 'excited', gesture: 'idle' }),
      );
    }
    // Fires on turn 1, then every COOLDOWN turns: 3 fires across 9 turns.
    expect(dartSpy).toHaveBeenCalledTimes(3);
  });
});
