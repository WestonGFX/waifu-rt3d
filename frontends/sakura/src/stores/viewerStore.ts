import { create } from 'zustand';

// ─── Types ──────────────────────────────────────────────────────────────────────

/**
 * Rendering mode — determines how viewer commands are dispatched:
 *   - 'vrm': Three.js iframe (VRM + GLB models)
 *   - 'live2d': PIXI canvas (Live2D Cubism models)
 *   - 'unity': Unity WebGL iframe (high-fidelity with lilToon shaders)
 */
export type ViewerMode = 'vrm' | 'live2d' | 'unity';

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
    | 'resetCamera'
    | 'setFOV'
    | 'blendShape'
    | 'blendShapes'
    | 'getBlendShapes'
    | 'entranceConfig'
    | 'queueGreetingGesture'
    | 'getSpringBoneInfo'
    | 'setSpringBoneParams'
    | 'setWind'
    | 'toggleColliderDebug'
    | 'playGlbAnimation'
    | 'stopGlbAnimation'
    | 'listGlbAnimations'
    | 'getGlbMorphTargets'
    | 'setGlbMorphTarget'
    | 'exitAnimation'
    | 'getModelInfo'
    // Phase 5: Post-processing & particles
    | 'setEffects'
    | 'getEffects'
    | 'spawnParticles'
    | 'clearParticles'
    | 'setAmbientParticles'
    | 'setEmotionParticles'
    // Photo Mode
    | 'enterPhotoMode'
    | 'exitPhotoMode'
    | 'holdGesture'
    | 'releaseGesture'
    | 'getCameraState'
    | 'setCameraState'
    // Phase 6: Motion capture, IK & animation
    | 'setEyeGaze'
    | 'loadAnimation'
    | 'playAnimation'
    | 'stopAnimation'
    | 'listAnimations'
    | 'setAnimationState'
    | 'getAnimationState'
    | 'startMocap'
    | 'stopMocap'
    | 'getMocapStatus'
    | 'loadAnimationManifest'
    | 'browseAnimations'
    // Phase 11A: Environment
    | 'setPose'
    | 'setTimeOfDay'
    // Phase 17A: Animation sequencer
    | 'triggerSequence'
    | 'cancelSequence'
    | 'getSequencerState';
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

  /** Reference to the VRM/GLB iframe element (set by ModelPanel). */
  iframeRef: HTMLIFrameElement | null;

  /** Reference to the Unity WebGL iframe element (set by ModelPanel). */
  unityIframeRef: HTMLIFrameElement | null;

  // ── Actions ─────────────────────────────────────────────────────────────────

  setMode: (mode: ViewerMode) => void;
  setIframeRef: (el: HTMLIFrameElement | null) => void;
  setUnityIframeRef: (el: HTMLIFrameElement | null) => void;

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
  dispatchScreenshot: (opts?: { quality?: number; transparent?: boolean }) => void;

  // ── Photo Mode ──────────────────────────────────────────────────────────

  /** Enter Photo Mode — freezes idle fidgets and emotion auto-decay. */
  dispatchEnterPhotoMode: () => void;

  /** Exit Photo Mode — resumes idle behaviors and tweens camera back. */
  dispatchExitPhotoMode: () => void;

  /** Freeze the current gesture at its current frame (Photo Mode). */
  dispatchHoldGesture: () => void;

  /** Release a held gesture, allowing it to complete/resume (Photo Mode). */
  dispatchReleaseGesture: () => void;

  /** Request current camera position and target from the viewer. */
  dispatchGetCameraState: () => void;

  /** Tween camera to a specific position and target. */
  dispatchSetCameraState: (position: { x: number; y: number; z: number }, target: { x: number; y: number; z: number }, duration?: number) => void;

  /** Load a 3D model in the active renderer. */
  dispatchLoadModel: (modelUrl: string) => void;

  /** Set camera preset (VRM only). */
  dispatchCameraPreset: (preset: 'fullbody' | 'bust' | 'face' | 'threeQuarter' | 'sideProfile' | 'lowAngle') => void;

  /** Reset camera to default fullbody view (VRM only). */
  dispatchResetCamera: () => void;

  /** Set camera field-of-view in degrees (30–90, default 50). */
  dispatchSetFOV: (fov: number) => void;

  /** Set a single blend shape (VRM only). */
  dispatchBlendShape: (name: string, value: number) => void;

  /** Set multiple blend shapes at once (VRM only). */
  dispatchBlendShapes: (shapes: Record<string, number>) => void;

  /** Request available blend shapes from the active renderer. */
  dispatchGetBlendShapes: () => void;

  /** Configure entrance animation (style, direction, duration, emotion). */
  dispatchEntranceConfig: (opts: { enabled?: boolean; direction?: 'left' | 'right'; duration?: number; style?: string; emotion?: string }) => void;

  /** Trigger an exit animation on the current model. */
  dispatchExitAnimation: (opts?: { style?: string; direction?: string; duration?: number }) => void;

  /** Queue a greeting gesture to play after entrance animation completes. */
  dispatchQueueGreetingGesture: (gesture: string) => void;

  /** Request spring bone info from the VRM viewer. */
  dispatchGetSpringBoneInfo: () => void;

  /** Set spring bone parameters on a specific joint. */
  dispatchSetSpringBoneParams: (jointIndex: number, params: { stiffness?: number; drag?: number; gravityPower?: number }) => void;

  /** Set wind force vector for spring bone simulation. */
  dispatchWind: (x: number, y: number, z: number, strength: number) => void;

  /** Toggle collider debug wireframe overlay. */
  dispatchToggleColliderDebug: () => void;

  /** Play a specific embedded GLB animation by name or index (with crossfade). */
  dispatchPlayGlbAnimation: (opts: { name?: string; index?: number; loop?: boolean; fadeIn?: number }) => void;

  /** Stop the current GLB animation with optional fade-out. */
  dispatchStopGlbAnimation: (fadeOut?: number) => void;

  /** Request list of embedded GLB animation clips. */
  dispatchListGlbAnimations: () => void;

  /** Request morph target list from a loaded GLB model. */
  dispatchGetGlbMorphTargets: () => void;

  /** Set a single morph target on a GLB mesh. */
  dispatchSetGlbMorphTarget: (meshName: string | undefined, targetIndex: number, value: number) => void;

  /** Request model type info from the viewer. */
  dispatchGetModelInfo: () => void;

  // Phase 5: Post-processing & particles
  /** Update post-processing effects configuration. */
  dispatchSetEffects: (config: Record<string, unknown>) => void;
  /** Request current effects configuration. */
  dispatchGetEffects: () => void;
  /** Spawn a burst of particles. */
  dispatchSpawnParticles: (opts?: { type?: string; count?: number; color?: number }) => void;
  /** Clear all active particles. */
  dispatchClearParticles: () => void;
  /** Set ambient particle type (sakura/dust/snow/null). */
  dispatchSetAmbientParticles: (type: string | null) => void;
  /** Enable/disable emotion-reactive particles. */
  dispatchSetEmotionParticles: (enabled: boolean) => void;

  // Phase 6: Motion capture, IK & animation
  /** Enable/disable eye gaze tracking (VRM lookAt driven by mouse). */
  dispatchSetEyeGaze: (enabled: boolean) => void;
  /** Load an animation clip. Optionally retarget Mixamo bone names. */
  dispatchLoadAnimation: (url: string, name: string, retarget?: boolean) => void;
  /** Play a loaded animation clip by name. */
  dispatchPlayAnimation: (name: string, opts?: { loop?: boolean; fadeIn?: number; timeScale?: number }) => void;
  /** Stop the current animation clip. */
  dispatchStopAnimation: (fadeDuration?: number) => void;
  /** List all loaded animation clips. */
  dispatchListAnimations: () => void;
  /** Force a specific animation state in the state machine. */
  dispatchSetAnimationState: (state: string, fadeDuration?: number) => void;
  /** Query the current animation state. */
  dispatchGetAnimationState: () => void;
  /** Start webcam face tracking (mocap). */
  dispatchStartMocap: () => void;
  /** Stop webcam face tracking. */
  dispatchStopMocap: () => void;
  /** Get webcam face tracking status. */
  dispatchGetMocapStatus: () => void;
  /** Load animation manifest into the viewer's AnimationRegistry. */
  dispatchLoadAnimationManifest: (manifest: Record<string, unknown>) => void;
  /** Request the viewer to return all animation clips grouped by category. */
  dispatchBrowseAnimations: () => void;

  // Phase 11A: Environment poses + time-of-day lighting
  /** Set character pose (standing, sitting_couch, sitting_desk, lying_bed). */
  dispatchSetPose: (pose: 'standing' | 'sitting_couch' | 'sitting_desk' | 'lying_bed') => void;
  /** Set time-of-day lighting (0-23 hour) or enable auto mode. */
  dispatchSetTimeOfDay: (opts: { hour?: number; auto?: boolean }) => void;

  // Phase 17A: Animation sequencer
  /**
   * Trigger an emotion-driven animation sequence on the active renderer.
   * The sequencer maps the emotion to a clip group, picks a clip based on
   * context (timeOfDay, energy level), and plays it with appropriate
   * crossfade transitions.
   */
  dispatchTriggerSequence: (
    emotion: string,
    context?: { timeOfDay?: string; energy?: number },
  ) => void;
  /**
   * Cancel any in-progress animation sequence and return to the idle state.
   * An optional fade duration can be sent via the payload.
   */
  dispatchCancelSequence: () => void;
  /**
   * Request the current sequencer state from the viewer (active clip,
   * queue depth, last emotion, etc.).  The viewer replies via postMessage
   * with kind 'sequencerState'.
   */
  dispatchGetSequencerState: () => void;
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

/**
 * Post a command to the Unity WebGL iframe.
 * Unity commands use the format: { type: 'unityCommand', command, data }
 * where data is a JSON string parsed by WaifuBridge.cs.
 */
function postToUnity(
  iframe: HTMLIFrameElement | null,
  command: string,
  data: Record<string, unknown> = {},
): void {
  iframe?.contentWindow?.postMessage(
    { type: 'unityCommand', command, data: JSON.stringify(data) },
    window.location.origin,
  );
}

// ─── Store ──────────────────────────────────────────────────────────────────────

export const useViewerStore = create<ViewerState>()((set, get) => ({
  mode: 'vrm',
  lastCommand: null,
  _seq: 0,
  iframeRef: null,
  unityIframeRef: null,

  setMode: (mode) => set({ mode }),
  setIframeRef: (el) => set({ iframeRef: el }),
  setUnityIframeRef: (el) => set({ unityIframeRef: el }),

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
    } else if (state.mode === 'unity') {
      postToUnity(state.unityIframeRef, 'SetExpression', { emotion, intensity });
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
    } else if (state.mode === 'unity') {
      postToUnity(state.unityIframeRef, 'PlayGesture', { gesture: gesture || '' });
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
    } else if (state.mode === 'unity') {
      postToUnity(state.unityIframeRef, 'PlayAudio', { audioUrl });
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

  dispatchScreenshot: (opts = {}) => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = {
      kind: 'screenshot',
      payload: opts,
      _seq: seq,
    };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'captureScreenshot', payload: opts });
    } else if (state.mode === 'unity') {
      postToUnity(state.unityIframeRef, 'CaptureScreenshot');
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  // ── Photo Mode ──────────────────────────────────────────────────────────

  dispatchEnterPhotoMode: () => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'enterPhotoMode', payload: {}, _seq: seq };
    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'enterPhotoMode' });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchExitPhotoMode: () => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'exitPhotoMode', payload: {}, _seq: seq };
    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'exitPhotoMode' });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchHoldGesture: () => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'holdGesture', payload: {}, _seq: seq };
    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'holdGesture' });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchReleaseGesture: () => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'releaseGesture', payload: {}, _seq: seq };
    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'releaseGesture' });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchGetCameraState: () => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'getCameraState', payload: {}, _seq: seq };
    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'getCameraState' });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchSetCameraState: (position, target, duration = 500) => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'setCameraState', payload: { position, target, duration }, _seq: seq };
    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'setCameraState', payload: { position, target, duration } });
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
    } else if (state.mode === 'unity') {
      postToUnity(state.unityIframeRef, 'LoadModel', { modelUrl });
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

  dispatchResetCamera: () => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'resetCamera', payload: {}, _seq: seq };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'resetCamera' });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchSetFOV: (fov) => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'setFOV', payload: { fov }, _seq: seq };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'setFOV', payload: { fov } });
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

  // ── Walk-On Entrance Animation ──────────────────────────────────────────────

  dispatchEntranceConfig: (opts) => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'entranceConfig', payload: opts, _seq: seq };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'setEntranceConfig', payload: opts });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchExitAnimation: (opts = {}) => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'exitAnimation', payload: opts, _seq: seq };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'exitAnimation', payload: opts });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchQueueGreetingGesture: (gesture) => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'queueGreetingGesture', payload: { gesture }, _seq: seq };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'queueGreetingGesture', payload: { gesture } });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  // ── Spring Bone Physics ─────────────────────────────────────────────────────

  dispatchGetSpringBoneInfo: () => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'getSpringBoneInfo', payload: {}, _seq: seq };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'getSpringBoneInfo' });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchSetSpringBoneParams: (jointIndex, params) => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'setSpringBoneParams', payload: { jointIndex, ...params }, _seq: seq };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'setSpringBoneParams', payload: { jointIndex, ...params } });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchWind: (x, y, z, strength) => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'setWind', payload: { x, y, z, strength }, _seq: seq };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'setWind', payload: { x, y, z, strength } });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchToggleColliderDebug: () => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'toggleColliderDebug', payload: {}, _seq: seq };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'toggleColliderDebug' });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  // ── GLB Animation Controls ──────────────────────────────────────────────────

  dispatchPlayGlbAnimation: (opts) => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'playGlbAnimation', payload: opts, _seq: seq };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'playGlbAnimation', payload: opts });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchStopGlbAnimation: (fadeOut = 0.3) => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'stopGlbAnimation', payload: { fadeOut }, _seq: seq };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'stopGlbAnimation', payload: { fadeOut } });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchListGlbAnimations: () => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'listGlbAnimations', payload: {}, _seq: seq };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'listGlbAnimations' });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchGetGlbMorphTargets: () => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'getGlbMorphTargets', payload: {}, _seq: seq };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'getGlbMorphTargets' });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchSetGlbMorphTarget: (meshName, targetIndex, value) => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'setGlbMorphTarget', payload: { meshName, targetIndex, value }, _seq: seq };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'setGlbMorphTarget', payload: { meshName, targetIndex, value } });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchGetModelInfo: () => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'getModelInfo', payload: {}, _seq: seq };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'getModelInfo' });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  // ── Phase 5: Post-Processing & Particle Dispatchers ───────────────────

  dispatchSetEffects: (config) => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'setEffects', payload: config, _seq: seq };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'setEffects', payload: config });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchGetEffects: () => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'getEffects', payload: {}, _seq: seq };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'getEffects' });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchSpawnParticles: (opts = {}) => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'spawnParticles', payload: opts, _seq: seq };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'spawnParticles', payload: opts });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchClearParticles: () => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'clearParticles', payload: {}, _seq: seq };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'clearParticles' });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchSetAmbientParticles: (type) => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'setAmbientParticles', payload: { type }, _seq: seq };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'setAmbientParticles', payload: { type } });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchSetEmotionParticles: (enabled) => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'setEmotionParticles', payload: { enabled }, _seq: seq };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'setEmotionParticles', payload: { enabled } });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  // ── Phase 6: Motion capture, IK & animation ──────────────────────────────

  dispatchSetEyeGaze: (enabled) => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'setEyeGaze', payload: { enabled }, _seq: seq };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'setEyeGaze', payload: { enabled } });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchLoadAnimation: (url, name, retarget = false) => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'loadAnimation', payload: { url, name, retarget }, _seq: seq };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'loadAnimation', payload: { url, name, retarget } });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchPlayAnimation: (name, opts = {}) => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'playAnimation', payload: { name, ...opts }, _seq: seq };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'playAnimation', payload: { name, ...opts } });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchStopAnimation: (fadeDuration = 0.3) => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'stopAnimation', payload: { fadeDuration }, _seq: seq };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'stopAnimation', payload: { fadeDuration } });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchListAnimations: () => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'listAnimations', payload: {}, _seq: seq };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'listAnimations' });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchSetAnimationState: (animState, fadeDuration) => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'setAnimationState', payload: { state: animState, fadeDuration }, _seq: seq };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'setAnimationState', payload: { state: animState, fadeDuration } });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchGetAnimationState: () => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'getAnimationState', payload: {}, _seq: seq };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'getAnimationState' });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchStartMocap: () => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'startMocap', payload: {}, _seq: seq };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'startMocap' });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchStopMocap: () => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'stopMocap', payload: {}, _seq: seq };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'stopMocap' });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchGetMocapStatus: () => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'getMocapStatus', payload: {}, _seq: seq };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'getMocapStatus' });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchLoadAnimationManifest: (manifest) => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'loadAnimationManifest', payload: { manifest }, _seq: seq };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'loadAnimationManifest', payload: { manifest } });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchBrowseAnimations: () => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'browseAnimations', payload: {}, _seq: seq };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'browseAnimations' });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  // Phase 11A: Environment poses + time-of-day lighting

  dispatchSetPose: (pose) => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'setPose', payload: { pose }, _seq: seq };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'setPose', payload: { pose } });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchSetTimeOfDay: (opts) => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'setTimeOfDay', payload: opts, _seq: seq };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'setTimeOfDay', payload: opts });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  // Phase 17A: Animation sequencer ────────────────────────────────────────────

  dispatchTriggerSequence: (emotion, context) => {
    const state = get();
    const seq = state._seq + 1;
    const payload: Record<string, unknown> = { emotion, ...context };
    const cmd: ViewerCommand = { kind: 'triggerSequence', payload, _seq: seq };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'triggerSequence', payload });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchCancelSequence: () => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'cancelSequence', payload: {}, _seq: seq };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'cancelSequence', payload: {} });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchGetSequencerState: () => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'getSequencerState', payload: {}, _seq: seq };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'getSequencerState', payload: {} });
    }
    set({ lastCommand: cmd, _seq: seq });
  },
}));
