/**
 * Tests for the Stage 3 Phase 3 clip dispatch in viewerStore.
 *
 * Covers `dispatchClip` (generic load-then-play of a normalized-VRM GLB by URL)
 * and `dispatchMotionResponse` (the `/api/motion/generate` tagged-union
 * dispatcher: clip → dispatchClip, otherwise → dispatchKeyframes).
 *
 * Fresh module per test (vi.resetModules) so the module-scope loaded-clip set is
 * clean. Pattern 1 (store-direct) per testing-conventions.md.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MotionGenerateResponse } from '../lib/api';

type ViewerStore = typeof import('../stores/viewerStore')['useViewerStore'];

let useViewerStore: ViewerStore;

beforeEach(async () => {
  vi.resetModules();
  ({ useViewerStore } = await import('../stores/viewerStore'));
});

function makeFakeIframe(): { el: HTMLIFrameElement; spy: ReturnType<typeof vi.fn> } {
  const spy = vi.fn();
  const el = { contentWindow: { postMessage: spy } } as unknown as HTMLIFrameElement;
  return { el, spy };
}

describe('viewerStore.dispatchClip', () => {
  it('loads then plays a clip by URL (first use loads + plays, next use plays only)', () => {
    const { el, spy } = makeFakeIframe();
    useViewerStore.setState({ iframeRef: el });

    useViewerStore.getState().dispatchClip('/files/animations/dart-generated/idle_ab12.glb', 'idle_ab12', { loop: true });
    expect(spy).toHaveBeenCalledTimes(2);
    const [load] = spy.mock.calls[0];
    expect(load.type).toBe('loadAnimation');
    expect(load.payload.url).toBe('/files/animations/dart-generated/idle_ab12.glb');
    expect(load.payload.name).toBe('idle_ab12');
    expect(load.payload.retarget).toBe(true);
    const [play] = spy.mock.calls[1];
    expect(play.type).toBe('playAnimation');
    expect(play.payload.loop).toBe(true);

    spy.mockClear();
    useViewerStore.getState().dispatchClip('/files/animations/dart-generated/idle_ab12.glb', 'idle_ab12', { loop: true });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].type).toBe('playAnimation');
  });

  it('is a no-op outside VRM mode or with empty url/name', () => {
    const { el, spy } = makeFakeIframe();
    useViewerStore.setState({ iframeRef: el, mode: 'live2d' });
    useViewerStore.getState().dispatchClip('/x.glb', 'x');
    expect(spy).not.toHaveBeenCalled();

    useViewerStore.setState({ mode: 'vrm' });
    useViewerStore.getState().dispatchClip('', 'x');
    useViewerStore.getState().dispatchClip('/x.glb', '');
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('viewerStore.dispatchMotionResponse', () => {
  it('routes a clip response to dispatchClip', () => {
    const clipSpy = vi.fn();
    const original = useViewerStore.getState().dispatchClip;
    useViewerStore.setState({ dispatchClip: clipSpy as unknown as typeof original });

    const resp: MotionGenerateResponse = {
      kind: 'clip',
      format: 'glb',
      url: '/files/animations/dart-generated/wave_99.glb',
      name: 'wave_99',
      backend: 'dart',
      loop: false,
    };
    useViewerStore.getState().dispatchMotionResponse(resp);
    expect(clipSpy).toHaveBeenCalledTimes(1);
    expect(clipSpy).toHaveBeenCalledWith(
      '/files/animations/dart-generated/wave_99.glb',
      'wave_99',
      { loop: false },
    );
  });

  it('routes a keyframes response to dispatchKeyframes', () => {
    const kfSpy = vi.fn();
    const original = useViewerStore.getState().dispatchKeyframes;
    useViewerStore.setState({ dispatchKeyframes: kfSpy as unknown as typeof original });

    const resp: MotionGenerateResponse = {
      kind: 'keyframes',
      label: 'motion_happy',
      backend: 'procedural',
      duration: 3,
      loop: true,
      keyframes: [{ time: 0, bones: {} }],
    };
    useViewerStore.getState().dispatchMotionResponse(resp);
    expect(kfSpy).toHaveBeenCalledTimes(1);
    expect(kfSpy.mock.calls[0][0]).toMatchObject({ backend: 'procedural' });
  });
});
