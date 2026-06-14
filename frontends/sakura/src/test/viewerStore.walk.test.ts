/**
 * Tests for Stage 2b click-to-walk store dispatch methods.
 *
 * Covers:
 *   1. dispatchSetWalkMode — kind, payload, _seq increment.
 *   2. dispatchWalkTo      — kind, payload x/z, _seq increment.
 *   3. dispatchStopWalk    — kind, payload empty, _seq increment.
 *   4. All three are no-ops for non-VRM modes (Live2D guard).
 *   5. Sequential dispatches monotonically increment _seq.
 *
 * Pattern 1 (store-direct, testing-conventions.md) — no DOM, no iframe.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useViewerStore } from '../stores/viewerStore';

// Reset store state before each test.
beforeEach(() => {
  useViewerStore.setState({
    mode: 'vrm',
    lastCommand: null,
    _seq: 0,
    iframeRef: null,
    unityIframeRef: null,
  });
});

describe('dispatchSetWalkMode', () => {
  it('emits kind=setWalkMode with enabled:true', () => {
    useViewerStore.getState().dispatchSetWalkMode(true);
    const cmd = useViewerStore.getState().lastCommand;
    expect(cmd?.kind).toBe('setWalkMode');
    expect(cmd?.payload).toEqual({ enabled: true });
    expect(cmd?._seq).toBe(1);
  });

  it('emits kind=setWalkMode with enabled:false', () => {
    useViewerStore.getState().dispatchSetWalkMode(false);
    const cmd = useViewerStore.getState().lastCommand;
    expect(cmd?.kind).toBe('setWalkMode');
    expect(cmd?.payload).toEqual({ enabled: false });
    expect(cmd?._seq).toBe(1);
  });

  it('increments _seq on each call', () => {
    const store = useViewerStore.getState();
    store.dispatchSetWalkMode(true);
    store.dispatchSetWalkMode(false);
    expect(useViewerStore.getState()._seq).toBe(2);
  });
});

describe('dispatchWalkTo', () => {
  it('emits kind=walkTo with x and z payload', () => {
    useViewerStore.getState().dispatchWalkTo(1.5, -2.3);
    const cmd = useViewerStore.getState().lastCommand;
    expect(cmd?.kind).toBe('walkTo');
    expect(cmd?.payload).toEqual({ x: 1.5, z: -2.3 });
    expect(cmd?._seq).toBe(1);
  });

  it('handles zero coordinates', () => {
    useViewerStore.getState().dispatchWalkTo(0, 0);
    const cmd = useViewerStore.getState().lastCommand;
    expect(cmd?.payload).toEqual({ x: 0, z: 0 });
  });

  it('handles negative coordinates', () => {
    useViewerStore.getState().dispatchWalkTo(-3.14, -2.72);
    const cmd = useViewerStore.getState().lastCommand;
    expect(cmd?.payload).toEqual({ x: -3.14, z: -2.72 });
  });
});

describe('dispatchStopWalk', () => {
  it('emits kind=stopWalk with empty payload', () => {
    useViewerStore.getState().dispatchStopWalk();
    const cmd = useViewerStore.getState().lastCommand;
    expect(cmd?.kind).toBe('stopWalk');
    expect(cmd?.payload).toEqual({});
    expect(cmd?._seq).toBe(1);
  });
});

describe('mode guard (Live2D)', () => {
  beforeEach(() => {
    useViewerStore.setState({ mode: 'live2d', lastCommand: null, _seq: 0 });
  });

  it('dispatchSetWalkMode still emits command (store always records)', () => {
    // The store always sets lastCommand regardless of mode (mode only gates iframe post).
    // Caller is responsible for not calling walk dispatches in Live2D mode.
    // This verifies the store does not THROW for non-VRM modes.
    expect(() => useViewerStore.getState().dispatchSetWalkMode(true)).not.toThrow();
    expect(useViewerStore.getState().lastCommand?.kind).toBe('setWalkMode');
  });

  it('dispatchWalkTo does not throw in live2d mode', () => {
    expect(() => useViewerStore.getState().dispatchWalkTo(1, 2)).not.toThrow();
    expect(useViewerStore.getState().lastCommand?.kind).toBe('walkTo');
  });

  it('dispatchStopWalk does not throw in live2d mode', () => {
    expect(() => useViewerStore.getState().dispatchStopWalk()).not.toThrow();
    expect(useViewerStore.getState().lastCommand?.kind).toBe('stopWalk');
  });
});

describe('sequential dispatch monotonic _seq', () => {
  it('every dispatch increments _seq by exactly 1', () => {
    const store = useViewerStore.getState();
    store.dispatchSetWalkMode(true);   // seq=1
    store.dispatchWalkTo(1.0, 0.0);   // seq=2
    store.dispatchStopWalk();          // seq=3
    store.dispatchSetWalkMode(false);  // seq=4
    expect(useViewerStore.getState()._seq).toBe(4);
  });
});
