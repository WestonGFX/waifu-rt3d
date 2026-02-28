import { create } from 'zustand';

// ─── Types ──────────────────────────────────────────────────────────────────────

/** Rendering mode — VRM uses an iframe, Live2D renders on a PIXI canvas. */
export type ViewerMode = 'vrm' | 'live2d';

/**
 * Dispatched viewer commands. Each renderer (VRM iframe / Live2D canvas)
 * subscribes to the store and translates these into its own API calls.
 *
 * The `_seq` counter increments on every dispatch so Zustand subscribers
 * always receive a fresh reference, even when the payload values are identical.
 */
export interface ViewerCommand {
  kind:
    | 'expression'
    | 'gesture'
    | 'background'
    | 'audio'
    | 'keyframes'
    | 'screenshot'
    | 'loadModel'
    | 'cameraPreset'
    | 'blendShape'
    | 'blendShapes'
    | 'getBlendShapes';
  payload: Record<string, unknown>;
  _seq: number;
}

interface ViewerState {
  /** Current rendering mode — drives conditional render in ModelPanel. */
  mode: ViewerMode;

  /** Most recent command dispatched. Renderers subscribe to this. */
  lastCommand: ViewerCommand | null;

  /** Internal monotonic counter so every dispatch produces a new reference. */
  _seq: number;

  /** Reference to the VRM iframe element (set by ModelPanel). */
  iframeRef: HTMLIFrameElement | null;

  // ── Actions ─────────────────────────────────────────────────────────────────

  setMode: (mode: ViewerMode) => void;
  setIframeRef: (el: HTMLIFrameElement | null) => void;

  /** Route an expression change to whichever renderer is active. */
  dispatchExpression: (emotion: string, intensity: number) => void;

  /** Route a gesture/motion trigger to the active renderer. */
  dispatchGesture: (
    gesture: string | null,
    expression: string | null,
    intensity?: number,
  ) => void;

  /** Route a background change to the VRM viewer. */
  dispatchBackground: (mode: string, value: string) => void;

  /** Route TTS audio playback (with lip sync) to the active renderer. */
  dispatchAudio: (audioUrl: string) => void;

  /** Route AI-generated keyframe animation to the VRM viewer. */
  dispatchKeyframes: (data: Record<string, unknown>) => void;

  /** Request a screenshot from the active renderer. */
  dispatchScreenshot: () => void;

  /** Load a 3D model in the active renderer. */
  dispatchLoadModel: (modelUrl: string) => void;

  /** Set camera preset (VRM only). */
  dispatchCameraPreset: (preset: 'fullbody' | 'bust' | 'face') => void;

  /** Set a single blend shape (VRM only). */
  dispatchBlendShape: (name: string, value: number) => void;

  /** Set multiple blend shapes at once (VRM only). */
  dispatchBlendShapes: (shapes: Record<string, number>) => void;

  /** Request available blend shapes from the active renderer. */
  dispatchGetBlendShapes: () => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Post a structured message to the VRM iframe's contentWindow.
 * No-ops if the iframe isn't mounted or hasn't loaded yet.
 *
 * Uses the current page origin to restrict postMessage to same-origin
 * iframes only (the VRM viewer is always served from the same host).
 */
function postToIframe(
  iframe: HTMLIFrameElement | null,
  message: Record<string, unknown>,
): void {
  iframe?.contentWindow?.postMessage(message, window.location.origin);
}

// ─── Store ──────────────────────────────────────────────────────────────────────

export const useViewerStore = create<ViewerState>()((set, get) => ({
  mode: 'vrm',
  lastCommand: null,
  _seq: 0,
  iframeRef: null,

  setMode: (mode) => set({ mode }),
  setIframeRef: (el) => set({ iframeRef: el }),

  dispatchExpression: (emotion, intensity) => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = {
      kind: 'expression',
      payload: { emotion, intensity },
      _seq: seq,
    };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'setExpression', emotion, intensity });
    }
    // Live2D renderers subscribe to lastCommand and handle 'expression' there.
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchGesture: (gesture, expression, intensity = 1.0) => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = {
      kind: 'gesture',
      payload: { gesture, expression, intensity },
      _seq: seq,
    };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, {
        type: 'trigger_gesture',
        gesture,
        expression,
        intensity,
      });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchBackground: (mode, value) => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = {
      kind: 'background',
      payload: { mode, value },
      _seq: seq,
    };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'updateBackground', mode, value });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchAudio: (audioUrl) => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = {
      kind: 'audio',
      payload: { audioUrl },
      _seq: seq,
    };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'playAudio', audioUrl });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchKeyframes: (data) => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = {
      kind: 'keyframes',
      payload: data,
      _seq: seq,
    };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'applyKeyframes', ...data });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchScreenshot: () => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = {
      kind: 'screenshot',
      payload: {},
      _seq: seq,
    };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'captureScreenshot' });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchLoadModel: (modelUrl) => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = {
      kind: 'loadModel',
      payload: { modelUrl },
      _seq: seq,
    };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, {
        type: 'loadCharacter',
        payload: { modelUrl },
      });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchCameraPreset: (preset) => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = {
      kind: 'cameraPreset',
      payload: { preset },
      _seq: seq,
    };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, {
        type: 'setCameraPreset',
        payload: { preset },
      });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchBlendShape: (name, value) => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = {
      kind: 'blendShape',
      payload: { name, value },
      _seq: seq,
    };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, {
        type: 'setBlendShape',
        payload: { name, value },
      });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchBlendShapes: (shapes) => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = {
      kind: 'blendShapes',
      payload: shapes,
      _seq: seq,
    };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'setBlendShapes', payload: shapes });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchGetBlendShapes: () => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = {
      kind: 'getBlendShapes',
      payload: {},
      _seq: seq,
    };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'getAvailableBlendShapes' });
    }
    set({ lastCommand: cmd, _seq: seq });
  },
}));
