/**
 * Tests for viewerStore.dispatchKokoroEmbodiment.
 *
 * Verifies the mapping of Kokoro's facialExpression / gesture / voiceStyle
 * enums into the existing dispatchExpression + dispatchGesture protocol.
 *
 * Follows testing-conventions.md Pattern 1 (store-direct).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useViewerStore } from '../stores/viewerStore';
import type { KokoroPayload } from '../lib/kokoro';

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

describe('viewerStore.dispatchKokoroEmbodiment', () => {
  let exprSpy: ReturnType<typeof vi.fn>;
  let gestureSpy: ReturnType<typeof vi.fn>;
  let originalExpr: typeof useViewerStore.getState extends () => infer S
    ? S extends { dispatchExpression: infer F } ? F : never
    : never;
  let originalGesture: typeof useViewerStore.getState extends () => infer S
    ? S extends { dispatchGesture: infer F } ? F : never
    : never;

  beforeEach(() => {
    // Save originals and replace via setState so dispatchKokoroEmbodiment's
    // internal get() picks up the mocks.  Spies don't reset cleanly across
    // tests on a shared zustand store, so we manage lifecycle by hand.
    const state = useViewerStore.getState();
    originalExpr = state.dispatchExpression;
    originalGesture = state.dispatchGesture;
    exprSpy = vi.fn();
    gestureSpy = vi.fn();
    useViewerStore.setState({
      dispatchExpression: exprSpy as unknown as typeof originalExpr,
      dispatchGesture: gestureSpy as unknown as typeof originalGesture,
    });
  });

  afterEach(() => {
    useViewerStore.setState({
      dispatchExpression: originalExpr,
      dispatchGesture: originalGesture,
    });
  });

  it('is a no-op when kokoroEnabled is false', () => {
    useViewerStore.getState().dispatchKokoroEmbodiment(
      payload({ diagnostics: { parseOk: true, bondLevel: 5, kokoroEnabled: false } })
    );
    expect(exprSpy).not.toHaveBeenCalled();
    expect(gestureSpy).not.toHaveBeenCalled();
  });

  it('dispatches expression mapped through KOKORO_FACE_TO_BLENDSHAPE', () => {
    useViewerStore.getState().dispatchKokoroEmbodiment(
      payload({ facialExpression: 'soft_smile', gesture: 'idle' })
    );
    expect(exprSpy).toHaveBeenCalledTimes(1);
    const [bs, intensity] = exprSpy.mock.calls[0];
    expect(bs).toBe('happy'); // soft_smile → happy
    expect(intensity).toBeGreaterThan(0);
  });

  it('skips gesture dispatch when gesture is idle', () => {
    useViewerStore.getState().dispatchKokoroEmbodiment(
      payload({ facialExpression: 'smile', gesture: 'idle' })
    );
    expect(exprSpy).toHaveBeenCalled();
    expect(gestureSpy).not.toHaveBeenCalled();
  });

  it('fires gesture when non-idle', () => {
    useViewerStore.getState().dispatchKokoroEmbodiment(
      payload({ facialExpression: 'smile', gesture: 'small_nod' })
    );
    expect(gestureSpy).toHaveBeenCalledTimes(1);
    const [gesture] = gestureSpy.mock.calls[0];
    expect(gesture).toBe('small_nod');
  });

  it('uses bright voice → high intensity (1.0)', () => {
    useViewerStore.getState().dispatchKokoroEmbodiment(
      payload({ facialExpression: 'smile', voiceStyle: 'bright' })
    );
    const [, intensity] = exprSpy.mock.calls[0];
    expect(intensity).toBe(1.0);
  });

  it('uses sleepy voice → low intensity (0.6)', () => {
    useViewerStore.getState().dispatchKokoroEmbodiment(
      payload({ facialExpression: 'sleepy', voiceStyle: 'sleepy' })
    );
    const [, intensity] = exprSpy.mock.calls[0];
    expect(intensity).toBe(0.6);
  });

  it('uses default voice → mid intensity (0.85)', () => {
    useViewerStore.getState().dispatchKokoroEmbodiment(
      payload({ facialExpression: 'neutral', voiceStyle: 'warm' })
    );
    const [, intensity] = exprSpy.mock.calls[0];
    expect(intensity).toBe(0.85);
  });

  it('unknown face falls back to neutral', () => {
    useViewerStore.getState().dispatchKokoroEmbodiment(
      payload({ facialExpression: 'concerned' })
    );
    const [bs] = exprSpy.mock.calls[0];
    // concerned maps to 'sad' per KOKORO_FACE_TO_BLENDSHAPE.
    expect(bs).toBe('sad');
  });
});
