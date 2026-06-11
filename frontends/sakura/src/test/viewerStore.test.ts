import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useViewerStore } from '../stores/viewerStore';
import type { KokoroPayload } from '../lib/kokoro';

/**
 * Tests for viewerStore.ts — the postMessage bridge between the Sakura UI
 * and the VRM/Live2D/Unity iframe renderers.
 *
 * All tests run store-direct (Pattern 1) — no React rendering required.
 * postMessage calls are intercepted via a fake iframe whose contentWindow
 * has a vi.fn() spy attached.
 */

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Build a minimal fake HTMLIFrameElement whose contentWindow.postMessage
 * is a Vitest spy.  Cast via `unknown` to satisfy strict TypeScript without
 * importing HTMLIFrameElement from @types/node.
 */
function makeFakeIframe(): { el: HTMLIFrameElement; spy: ReturnType<typeof vi.fn> } {
  const spy = vi.fn();
  const el = { contentWindow: { postMessage: spy } } as unknown as HTMLIFrameElement;
  return { el, spy };
}

/**
 * Return a fully-populated KokoroPayload for use in embodiment tests.
 * Individual tests override only the fields they care about.
 */
function makeKokoroPayload(overrides: Partial<KokoroPayload> = {}): KokoroPayload {
  return {
    reply: 'Hello!',
    innerThought: '...',
    emotion: 'happy',
    facialExpression: 'smile',
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
    diagnostics: { parseOk: true, bondLevel: 0, kokoroEnabled: true },
    ...overrides,
  };
}

// ── Initial store defaults ─────────────────────────────────────────────────────

/** Canonical initial state — mirrors the create() defaults in viewerStore.ts. */
const defaultState = {
  mode: 'vrm' as const,
  lastCommand: null,
  _seq: 0,
  iframeRef: null,
  unityIframeRef: null,
};

// ── Test suites ────────────────────────────────────────────────────────────────

describe('viewerStore — initial state', () => {
  beforeEach(() => {
    useViewerStore.setState(defaultState);
  });

  it('initializes with mode=vrm, lastCommand=null, _seq=0, and null refs', () => {
    const state = useViewerStore.getState();
    expect(state.mode).toBe('vrm');
    expect(state.lastCommand).toBeNull();
    expect(state._seq).toBe(0);
    expect(state.iframeRef).toBeNull();
    expect(state.unityIframeRef).toBeNull();
  });
});

// ── Setters ────────────────────────────────────────────────────────────────────

describe('viewerStore — setters', () => {
  beforeEach(() => {
    useViewerStore.setState(defaultState);
  });

  it('setMode updates the rendering mode', () => {
    useViewerStore.getState().setMode('live2d');
    expect(useViewerStore.getState().mode).toBe('live2d');
  });

  it('setIframeRef stores the VRM iframe reference', () => {
    const { el } = makeFakeIframe();
    useViewerStore.getState().setIframeRef(el);
    expect(useViewerStore.getState().iframeRef).toBe(el);
  });

  it('setIframeRef accepts null to detach the reference', () => {
    const { el } = makeFakeIframe();
    useViewerStore.getState().setIframeRef(el);
    useViewerStore.getState().setIframeRef(null);
    expect(useViewerStore.getState().iframeRef).toBeNull();
  });

  it('setUnityIframeRef stores the Unity iframe reference', () => {
    const { el } = makeFakeIframe();
    useViewerStore.getState().setUnityIframeRef(el);
    expect(useViewerStore.getState().unityIframeRef).toBe(el);
  });
});

// ── dispatchExpression ─────────────────────────────────────────────────────────

describe('viewerStore — dispatchExpression', () => {
  let vrmSpy: ReturnType<typeof vi.fn>;
  let unitySpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const vrm = makeFakeIframe();
    const unity = makeFakeIframe();
    vrmSpy = vrm.spy;
    unitySpy = unity.spy;
    useViewerStore.setState({
      ...defaultState,
      iframeRef: vrm.el,
      unityIframeRef: unity.el,
    });
  });

  it('vrm mode — posts setExpression message with correct payload', () => {
    useViewerStore.getState().dispatchExpression('happy', 0.8);
    expect(vrmSpy).toHaveBeenCalledOnce();
    const [msg] = vrmSpy.mock.calls[0];
    expect(msg).toMatchObject({ type: 'setExpression', emotion: 'happy', intensity: 0.8 });
  });

  it('vrm mode — updates lastCommand with kind=expression and increments _seq', () => {
    useViewerStore.getState().dispatchExpression('surprised', 1.0);
    const state = useViewerStore.getState();
    expect(state.lastCommand?.kind).toBe('expression');
    expect(state.lastCommand?.payload).toEqual({ emotion: 'surprised', intensity: 1.0 });
    expect(state._seq).toBe(1);
  });

  it('live2d mode — does NOT call postMessage but still updates lastCommand', () => {
    useViewerStore.setState({ mode: 'live2d' });
    useViewerStore.getState().dispatchExpression('sad', 0.5);
    expect(vrmSpy).not.toHaveBeenCalled();
    const state = useViewerStore.getState();
    expect(state.lastCommand?.kind).toBe('expression');
    expect(state.lastCommand?.payload).toEqual({ emotion: 'sad', intensity: 0.5 });
  });

  it('unity mode — posts wrapped unityCommand envelope with JSON-stringified data', () => {
    useViewerStore.setState({ mode: 'unity' });
    useViewerStore.getState().dispatchExpression('relaxed', 0.7);
    expect(unitySpy).toHaveBeenCalledOnce();
    const [msg] = unitySpy.mock.calls[0];
    expect(msg.type).toBe('unityCommand');
    expect(msg.command).toBe('SetExpression');
    const data = JSON.parse(msg.data as string);
    expect(data).toEqual({ emotion: 'relaxed', intensity: 0.7 });
  });

  it('_seq is monotonically increasing across multiple dispatches', () => {
    useViewerStore.getState().dispatchExpression('happy', 1.0);
    useViewerStore.getState().dispatchExpression('sad', 0.5);
    useViewerStore.getState().dispatchExpression('neutral', 0.8);
    expect(useViewerStore.getState()._seq).toBe(3);
  });
});

// ── dispatchGesture ────────────────────────────────────────────────────────────

describe('viewerStore — dispatchGesture', () => {
  let vrmSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const vrm = makeFakeIframe();
    vrmSpy = vrm.spy;
    useViewerStore.setState({ ...defaultState, iframeRef: vrm.el });
  });

  it('vrm mode — posts trigger_gesture with the supplied values', () => {
    // tilt_head is permanently procedural (no baked clip mapped), so this test
    // is independent of the gesture-clip cache. Mapped gestures (wave, ...) may
    // post loadAnimation/playAnimation instead — covered in
    // viewerStore.kokoroGestureClips.test.ts.
    useViewerStore.getState().dispatchGesture('tilt_head', 'happy', 0.9);
    const msg = vrmSpy.mock.calls.map((c) => c[0]).find((m) => m.type === 'trigger_gesture');
    expect(msg).toMatchObject({ type: 'trigger_gesture', gesture: 'tilt_head', expression: 'happy', intensity: 0.9 });
  });

  it('defaults intensity to 1.0 when not supplied', () => {
    useViewerStore.getState().dispatchGesture('tilt_head', 'neutral');
    const msg = vrmSpy.mock.calls.map((c) => c[0]).find((m) => m.type === 'trigger_gesture');
    expect(msg.intensity).toBe(1.0);
  });

  it('updates lastCommand with kind=gesture', () => {
    useViewerStore.getState().dispatchGesture('wave', 'happy', 0.9);
    expect(useViewerStore.getState().lastCommand?.kind).toBe('gesture');
    expect(useViewerStore.getState().lastCommand?.payload).toMatchObject({
      gesture: 'wave',
      expression: 'happy',
      intensity: 0.9,
    });
  });
});

// ── dispatchKokoroEmbodiment ───────────────────────────────────────────────────

describe('viewerStore — dispatchKokoroEmbodiment', () => {
  let vrmSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const vrm = makeFakeIframe();
    vrmSpy = vrm.spy;
    useViewerStore.setState({ ...defaultState, iframeRef: vrm.el });
  });

  it('short-circuits when kokoroEnabled=false — no postMessage, no lastCommand', () => {
    const payload = makeKokoroPayload({ diagnostics: { parseOk: true, bondLevel: 0, kokoroEnabled: false } });
    useViewerStore.getState().dispatchKokoroEmbodiment(payload);
    expect(vrmSpy).not.toHaveBeenCalled();
    expect(useViewerStore.getState().lastCommand).toBeNull();
    expect(useViewerStore.getState()._seq).toBe(0);
  });

  it('maps facialExpression through KOKORO_FACE_TO_BLENDSHAPE (soft_smile → happy)', () => {
    const payload = makeKokoroPayload({ facialExpression: 'soft_smile', voiceStyle: 'warm' });
    useViewerStore.getState().dispatchKokoroEmbodiment(payload);
    const [msg] = vrmSpy.mock.calls[0];
    expect(msg.type).toBe('setExpression');
    expect(msg.emotion).toBe('happy');
  });

  it('hot voice style (teasing) → intensity 1.0', () => {
    const payload = makeKokoroPayload({ facialExpression: 'smile', voiceStyle: 'teasing' });
    useViewerStore.getState().dispatchKokoroEmbodiment(payload);
    const [msg] = vrmSpy.mock.calls[0];
    expect(msg.intensity).toBe(1.0);
  });

  it('cool voice style (sleepy) → intensity 0.6', () => {
    const payload = makeKokoroPayload({ facialExpression: 'sleepy', voiceStyle: 'sleepy' });
    useViewerStore.getState().dispatchKokoroEmbodiment(payload);
    const [msg] = vrmSpy.mock.calls[0];
    expect(msg.intensity).toBe(0.6);
  });

  it('neutral voice style (warm) → intensity 0.85', () => {
    const payload = makeKokoroPayload({ facialExpression: 'neutral', voiceStyle: 'warm' });
    useViewerStore.getState().dispatchKokoroEmbodiment(payload);
    const [msg] = vrmSpy.mock.calls[0];
    expect(msg.intensity).toBe(0.85);
  });

  it('gesture=idle skips dispatchGesture — expression + gaze only', () => {
    const payload = makeKokoroPayload({ gesture: 'idle', facialExpression: 'neutral', voiceStyle: 'warm' });
    useViewerStore.getState().dispatchKokoroEmbodiment(payload);
    // expression + gaze (default 'user' → cursor) = 2 calls; no gesture call.
    expect(vrmSpy).toHaveBeenCalledTimes(2);
  });

  it('non-idle gesture triggers expression + gesture + gaze — _seq increments by 3', () => {
    const payload = makeKokoroPayload({ gesture: 'wave', facialExpression: 'smile', voiceStyle: 'bright' });
    useViewerStore.getState().dispatchKokoroEmbodiment(payload);
    // expression + gesture + gaze = 3 postMessage calls
    expect(vrmSpy).toHaveBeenCalledTimes(3);
    expect(useViewerStore.getState()._seq).toBe(3);
  });

  it('concerned facialExpression maps to sad blendshape', () => {
    const payload = makeKokoroPayload({ facialExpression: 'concerned', voiceStyle: 'calm' });
    useViewerStore.getState().dispatchKokoroEmbodiment(payload);
    const [msg] = vrmSpy.mock.calls[0];
    expect(msg.emotion).toBe('sad');
  });
});

// ── VRM-only dispatchers gated by mode ─────────────────────────────────────────

describe('viewerStore — VRM-only dispatchers skipped in live2d mode', () => {
  let vrmSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const vrm = makeFakeIframe();
    vrmSpy = vrm.spy;
    useViewerStore.setState({ ...defaultState, iframeRef: vrm.el, mode: 'live2d' });
  });

  it('dispatchBackground skips postMessage in live2d but updates lastCommand', () => {
    useViewerStore.getState().dispatchBackground('color', '#ff0000');
    expect(vrmSpy).not.toHaveBeenCalled();
    const state = useViewerStore.getState();
    expect(state.lastCommand?.kind).toBe('background');
    expect(state.lastCommand?.payload).toEqual({ mode: 'color', value: '#ff0000' });
  });

  it('dispatchBlendShape skips postMessage in live2d but updates lastCommand', () => {
    useViewerStore.getState().dispatchBlendShape('A', 0.5);
    expect(vrmSpy).not.toHaveBeenCalled();
    expect(useViewerStore.getState().lastCommand?.kind).toBe('blendShape');
  });
});

// ── Fire-and-forget dispatchers (no lastCommand update) ────────────────────────

describe('viewerStore — fire-and-forget dispatchers', () => {
  let vrmSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const vrm = makeFakeIframe();
    vrmSpy = vrm.spy;
    useViewerStore.setState({ ...defaultState, iframeRef: vrm.el });
  });

  it('dispatchTriggerGazeFlick posts triggerGazeFlick without updating lastCommand or _seq', () => {
    useViewerStore.getState().dispatchTriggerGazeFlick();
    expect(vrmSpy).toHaveBeenCalledOnce();
    const [msg] = vrmSpy.mock.calls[0];
    expect(msg.type).toBe('triggerGazeFlick');
    expect(useViewerStore.getState().lastCommand).toBeNull();
    expect(useViewerStore.getState()._seq).toBe(0);
  });

  it('dispatchSetPersonality posts setPersonality without updating lastCommand or _seq', () => {
    const profile = { energy: 0.8, warmth: 0.9 };
    useViewerStore.getState().dispatchSetPersonality(profile);
    expect(vrmSpy).toHaveBeenCalledOnce();
    const [msg] = vrmSpy.mock.calls[0];
    expect(msg.type).toBe('setPersonality');
    expect(msg.payload).toEqual(profile);
    expect(useViewerStore.getState().lastCommand).toBeNull();
    expect(useViewerStore.getState()._seq).toBe(0);
  });

  it('dispatchSetJiggleEmotionMultiplier posts without updating lastCommand or _seq', () => {
    useViewerStore.getState().dispatchSetJiggleEmotionMultiplier(1.3);
    expect(vrmSpy).toHaveBeenCalledOnce();
    const [msg] = vrmSpy.mock.calls[0];
    expect(msg.type).toBe('setJiggleEmotionMultiplier');
    expect(msg.multiplier).toBe(1.3);
    expect(useViewerStore.getState().lastCommand).toBeNull();
    expect(useViewerStore.getState()._seq).toBe(0);
  });
});

// ── Default parameter propagation ─────────────────────────────────────────────

describe('viewerStore — default parameter propagation', () => {
  let vrmSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const vrm = makeFakeIframe();
    vrmSpy = vrm.spy;
    useViewerStore.setState({ ...defaultState, iframeRef: vrm.el });
  });

  it('dispatchStopGlbAnimation defaults fadeOut to 0.3', () => {
    useViewerStore.getState().dispatchStopGlbAnimation();
    const [msg] = vrmSpy.mock.calls[0];
    expect(msg.payload).toEqual({ fadeOut: 0.3 });
    expect(useViewerStore.getState().lastCommand?.payload).toEqual({ fadeOut: 0.3 });
  });

  it('dispatchSetCameraState defaults duration to 500', () => {
    const pos = { x: 0, y: 1, z: 2 };
    const tgt = { x: 0, y: 0, z: 0 };
    useViewerStore.getState().dispatchSetCameraState(pos, tgt);
    const [msg] = vrmSpy.mock.calls[0];
    expect(msg.payload).toEqual({ position: pos, target: tgt, duration: 500 });
  });

  it('dispatchStopAnimation defaults fadeDuration to 0.3', () => {
    useViewerStore.getState().dispatchStopAnimation();
    const [msg] = vrmSpy.mock.calls[0];
    expect(msg.payload).toEqual({ fadeDuration: 0.3 });
  });

  it('dispatchJiggleIntensity without bodyPart sends only intensity field', () => {
    useViewerStore.getState().dispatchSetJiggleIntensity(0.6);
    const [msg] = vrmSpy.mock.calls[0];
    expect(msg.payload).toEqual({ intensity: 0.6 });
  });

  it('dispatchJiggleIntensity with bodyPart includes bodyPart in payload', () => {
    useViewerStore.getState().dispatchSetJiggleIntensity(0.8, 'breast');
    const [msg] = vrmSpy.mock.calls[0];
    expect(msg.payload).toEqual({ intensity: 0.8, bodyPart: 'breast' });
  });
});

// ── Sequencer dispatchers ──────────────────────────────────────────────────────

describe('viewerStore — animation sequencer dispatchers', () => {
  let vrmSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const vrm = makeFakeIframe();
    vrmSpy = vrm.spy;
    useViewerStore.setState({ ...defaultState, iframeRef: vrm.el });
  });

  it('dispatchTriggerSequence posts triggerSequence with emotion and context', () => {
    useViewerStore.getState().dispatchTriggerSequence('happy', { timeOfDay: 'evening', energy: 0.7 });
    const [msg] = vrmSpy.mock.calls[0];
    expect(msg.type).toBe('triggerSequence');
    expect(msg.payload).toMatchObject({ emotion: 'happy', timeOfDay: 'evening', energy: 0.7 });
    expect(useViewerStore.getState().lastCommand?.kind).toBe('triggerSequence');
  });

  it('dispatchCancelSequence posts cancelSequence and updates lastCommand', () => {
    useViewerStore.getState().dispatchCancelSequence();
    const [msg] = vrmSpy.mock.calls[0];
    expect(msg.type).toBe('cancelSequence');
    expect(useViewerStore.getState().lastCommand?.kind).toBe('cancelSequence');
  });
});
