import { create } from 'zustand';
import { KOKORO_FACE_TO_BLENDSHAPE, kokoroGazeToLookAt } from '../lib/kokoro';
import type { KokoroGaze } from '../lib/kokoro';
import {
  DART_GESTURE_COOLDOWN_TURNS,
  dartGestureUrl,
  resolveDartGesture,
} from '../lib/dartGestures';

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
 *
 * ⚠ Dual-vocabulary seam — there is NO compile-time link between a
 * `ViewerCommand.kind` here and the `type` string the VRM iframe listens for in
 * `frontends/shared/viewer/viewer.html` (`window.addEventListener('message', …)`,
 * destructures `{ type, payload }`). When adding a new `kind`, you MUST add the
 * matching `if (type === '…')` handler in viewer.html or the dispatch is a
 * silent no-op. Most kinds map 1:1 to their iframe `type`, but a few are
 * renamed — keep this table current:
 *
 *   kind            → viewer.html `type`
 *   ──────────────────────────────────────
 *   expression      → setExpression
 *   gesture         → trigger_gesture
 *   background      → updateBackground
 *   gaze            → lookAt            (Kokoro gaze → VRM LookAt layer)
 *   setEyeGaze      → setEyeGaze
 *   setWalkMode     → setWalkMode       (Stage 2b: click-to-walk dev gate)
 *   walkTo          → walkTo            (Stage 2b: direct walk command)
 *   stopWalk        → stopWalk          (Stage 2b: cancel active walk)
 *   (Unity renderer wraps differently again: { type: 'unityCommand', command })
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
    | 'gaze'
    | 'listeningState'
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
    // Stage 2a: avatar in a real 3D location
    | 'loadEnvironment'
    | 'clearEnvironment'
    // Phase 17A: Animation sequencer
    | 'triggerSequence'
    | 'cancelSequence'
    | 'getSequencerState'
    // Jiggle physics
    | 'setJiggleEnabled'
    | 'setJiggleIntensity'
    | 'setJigglePreset'
    | 'getJiggleInfo'
    // Stage 2b: click-to-walk navigation
    | 'setWalkMode'
    | 'walkTo'
    | 'stopWalk';
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

  /**
   * Apply a Kokoro embodiment payload to the active renderer.
   *
   * Maps Kokoro's vocabulary (facialExpression/gesture/gaze enums) to the
   * existing expression + gesture + lookAt postMessage protocol — no new
   * viewer.html surface area.  Safe to call whether the gate was open or
   * closed; when ``payload.diagnostics.kokoroEnabled`` is false this is a no-op.
   */
  dispatchKokoroEmbodiment: (payload: import('../lib/kokoro').KokoroPayload) => void;

  /**
   * Play a pre-baked DART gesture clip (Stage 3 Phase 5.1) by library name.
   *
   * Loads the normalized-VRM GLB from {@link dartGestureUrl} on first use and
   * plays it on subsequent use, mirroring the Mixamo gesture-clip pattern. A
   * missing GLB (e.g. not yet built on this machine) is a no-op. VRM-only.
   */
  dispatchDartGesture: (name: string) => void;

  /** Route a background change to the VRM viewer. */
  dispatchBackground: (mode: string, value: string) => void;

  /** Route TTS audio playback (with lip sync) to the active renderer. */
  dispatchAudio: (audioUrl: string) => void;

  /** Route AI-generated keyframe animation to the VRM viewer. */
  dispatchKeyframes: (data: Record<string, unknown>) => void;

  /**
   * Load + play an arbitrary normalized-VRM clip by URL (Stage 3 Phase 3).
   *
   * Used for AI-generated DART clips served at `/files/…`. Loads on first use
   * and plays on subsequent use (same load-then-play pattern as the gesture
   * clips); VRM-only. A missing/failed URL is a no-op.
   */
  dispatchClip: (url: string, name: string, opts?: { loop?: boolean; fadeIn?: number }) => void;

  /**
   * Dispatch a `/api/motion/generate` response to the viewer (Stage 3 Phase 3).
   *
   * Discriminates on the tagged union: a `clip` response loads its GLB via
   * {@link dispatchClip}; anything else is forwarded as keyframes.
   */
  dispatchMotionResponse: (resp: import('../lib/api').MotionGenerateResponse) => void;

  /** Request a screenshot from the active renderer. */
  dispatchScreenshot: (opts?: { quality?: number; transparent?: boolean; requestId?: string }) => void;

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
  /**
   * Steer the avatar's gaze from a Kokoro `gaze` token (user/away/thinking/
   * object/camera). Reuses the viewer's always-on LookAt layer via the
   * `lookAt` postMessage; `'user'` returns to cursor-follow so procedural
   * head/neck idle motion is preserved. No-op outside VRM mode.
   */
  dispatchGaze: (gaze: KokoroGaze) => void;

  /**
   * Reflect the voice-duplex listening state on the avatar. When the session
   * is actively listening to the user, she attends: gaze settles toward the
   * user and blinking slows slightly. Released when listening ends so idle
   * behaviour resumes. Additive over the always-on LookAt/Blink layers — no
   * new animation engine. No-op outside VRM mode.
   */
  dispatchListeningState: (active: boolean) => void;
  /** Load an animation clip. Optionally retarget Mixamo bone names. */
  dispatchLoadAnimation: (url: string, name: string, retarget?: boolean) => void;
  /** Stage 2a: load a static environment GLB behind the avatar, or pass null to clear it. */
  dispatchLoadEnvironment: (url: string | null) => void;
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

  // ── Jiggle Physics ──────────────────────────────────────────────────────────

  /**
   * Enable or disable jiggle physics in the 3D viewer.
   *
   * @param enabled - Whether jiggle physics should be active.
   */
  dispatchSetJiggleEnabled: (enabled: boolean) => void;

  /**
   * Set jiggle intensity, optionally scoped to one body part.
   *
   * @param intensity - New intensity value (0.0–1.0).
   * @param bodyPart  - Optional body part to target; omit for global intensity.
   */
  dispatchSetJiggleIntensity: (intensity: number, bodyPart?: 'breast' | 'butt' | 'thigh') => void;

  /**
   * Apply a named jiggle preset to the viewer.
   *
   * @param preset - Preset name (e.g. 'subtle', 'bouncy').
   */
  dispatchSetJigglePreset: (preset: string) => void;

  /**
   * Request current jiggle state from the viewer. The viewer replies via
   * postMessage with type 'jiggleInfo'.
   */
  dispatchGetJiggleInfo: () => void;

  /**
   * Trigger a brief downward gaze flick in the viewer — character glances
   * toward keyboard, as if noticing the user has started typing.
   */
  dispatchTriggerGazeFlick: () => void;

  /**
   * Apply a personality profile to the AnimationDirector.
   * Drives idle fidget selection, breath speed, and energy level.
   *
   * @param profile - Personality params (energy, nervousness, warmth, playfulness, etc.)
   */
  dispatchSetPersonality: (profile: Record<string, number>) => void;

  /**
   * Scale jiggle physics intensity by a per-emotion multiplier.
   * Excited emotions increase movement; sad/calm reduce it.
   *
   * @param multiplier - Intensity scale factor (e.g. 1.3 for excited, 0.7 for sad)
   */
  dispatchSetJiggleEmotionMultiplier: (multiplier: number) => void;

  // ── Stage 2b: Click-to-Walk Navigation ─────────────────────────────────────

  /**
   * Enable or disable click-to-walk mode in the viewer.
   * When disabled (default) canvas clicks behave exactly as before.
   * When enabled, clicking a floor surface drives the avatar to that point.
   *
   * @param enabled - Whether click-to-walk should be active.
   */
  dispatchSetWalkMode: (enabled: boolean) => void;

  /**
   * Command the avatar to walk to a world-space XZ position.
   * Interruptible: a new call while walking retargets cleanly.
   * The viewer posts `{ type: 'avatarMoved', x, z }` on arrival and
   * `{ type: 'walkBlocked', x, z }` when stopped by a wall.
   *
   * @param x - World X destination
   * @param z - World Z destination
   */
  dispatchWalkTo: (x: number, z: number) => void;

  /**
   * Cancel any active walk and settle the avatar to idle.
   */
  dispatchStopWalk: () => void;
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

/**
 * Kokoro gesture → baked mocap clip mapping (Stage 1 Step 1.4 / Phase C).
 *
 * Values are clip stems under /files/animations/vrm-baked/<stem>.normalized.glb —
 * Mixamo motion baked onto a VRM rig in Blender, then converted to three-vrm
 * NORMALIZED bone space (tools/convert_to_normalized.py), so they play on any
 * VRM via the viewer's retarget:true path. A `null` value (or a missing key)
 * forces the procedural gesture — the reversible escape hatch if a clip
 * regresses. tilt_head stays procedural: no matching Mixamo clip and the
 * head-only procedural version reads better than a full-body clip.
 */
const KOKORO_GESTURE_CLIPS: Record<string, string | null> = {
  wave: 'waving',
  thinking: 'thinking',
  point: 'pointing',
  hands_clasped: 'hands_forward_gesture',
  heart: 'blow_a_kiss',
  small_nod: 'head_nod_yes',
  tilt_head: null,
};

/**
 * Clips already sent to the viewer with loadAnimation. The viewer's ClipLayer
 * keeps its own library, but it is rebuilt on every model load — so this set
 * is cleared in dispatchLoadModel. First use of a gesture plays the procedural
 * fallback while its clip loads (playClip on an unloaded name is a no-op);
 * every later use plays the real mocap clip.
 */
const loadedGestureClips = new Set<string>();

/**
 * DART gesture clips already sent to the viewer (Phase 5.1). Like
 * {@link loadedGestureClips}, cleared on model load. Names are prefixed `dart_`
 * in the viewer's clip library so they never collide with Mixamo clip stems.
 */
const loadedDartClips = new Set<string>();

/**
 * Throttle state for emotion-driven DART gap-fill gestures.
 * `_kokoroTurn` increments once per Kokoro embodiment dispatch (≈ one assistant
 * turn); `_lastDartGestureTurn` records the turn a gap-fill gesture last fired.
 * Initialised so the first eligible turn always fires.
 */
let _kokoroTurn = 0;
let _lastDartGestureTurn = -DART_GESTURE_COOLDOWN_TURNS;

/**
 * Generated DART motion clips (Phase 3) already sent to the viewer, keyed by
 * clip name. Like the gesture sets, cleared on model load (the viewer rebuilds
 * its clip library). Names are URL-content-hashed Mac-side so they never collide.
 */
const loadedClips = new Set<string>();

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
      // Prefer a baked mocap clip when one is mapped for this gesture; fall
      // back to the procedural gesture otherwise. The first occurrence of a
      // mapped gesture also falls back (clip still loading) — by the next
      // occurrence the clip is in the viewer's library and plays for real.
      const clip = gesture ? KOKORO_GESTURE_CLIPS[gesture] : null;
      if (clip && loadedGestureClips.has(clip)) {
        postToIframe(state.iframeRef, {
          type: 'playAnimation',
          payload: { name: clip, loop: false, fadeIn: 0.25 },
        });
      } else {
        if (clip) {
          loadedGestureClips.add(clip);
          postToIframe(state.iframeRef, {
            type: 'loadAnimation',
            payload: {
              url: `/files/animations/vrm-baked/${clip}.normalized.glb`,
              name: clip,
              retarget: true,
            },
          });
        }
        postToIframe(state.iframeRef, {
          type: 'trigger_gesture',
          gesture,
          expression,
          intensity,
        });
      }
    } else if (state.mode === 'unity') {
      postToUnity(state.unityIframeRef, 'PlayGesture', { gesture: gesture || '' });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchKokoroEmbodiment: (payload) => {
    if (!payload?.diagnostics?.kokoroEnabled) return;
    const blendshape = KOKORO_FACE_TO_BLENDSHAPE[payload.facialExpression] || 'neutral';
    // Step 1 — set facial expression.  Intensity tracked from "softness" of
    // the chosen voice; teasing/playful run hotter than calm/sleepy.
    const hotVoices = new Set(['bright', 'teasing']);
    const coolVoices = new Set(['sleepy', 'calm']);
    const intensity = hotVoices.has(payload.voiceStyle)
      ? 1.0
      : coolVoices.has(payload.voiceStyle)
        ? 0.6
        : 0.85;
    get().dispatchExpression(blendshape, intensity);
    // Step 2 — gesture, unless idle (idle means "do nothing new" — let the
    // talk/idle state machine continue).
    const hasExplicitGesture = !!payload.gesture && payload.gesture !== 'idle';
    if (hasExplicitGesture) {
      get().dispatchGesture(payload.gesture, blendshape, intensity);
    }
    // Step 3 — gaze direction. Drives the always-on LookAt layer so the
    // character actually looks where the model said it would (away when shy,
    // up when thinking, etc.). 'user' returns to cursor-follow, preserving the
    // procedural head/neck idle motion rather than locking the head forward.
    if (payload.gaze) {
      get().dispatchGaze(payload.gaze);
    }
    // Step 4 — emotion-driven DART gap-fill gesture (Phase 5.1). Only when the
    // LLM did NOT pick an explicit gesture, the emotion maps to a body gesture
    // (resolveDartGesture), and the throttle cooldown has elapsed — so the
    // avatar reacts with her body to emotional tone without becoming a
    // "caffeinated VTuber." Throttle counts every turn; the gesture fires at
    // most once per DART_GESTURE_COOLDOWN_TURNS turns. Degrades gracefully: a
    // missing DART GLB just never plays (same as the Mixamo gesture path).
    _kokoroTurn += 1;
    if (!hasExplicitGesture) {
      const dartName = resolveDartGesture(payload.emotion);
      if (dartName && _kokoroTurn - _lastDartGestureTurn >= DART_GESTURE_COOLDOWN_TURNS) {
        _lastDartGestureTurn = _kokoroTurn;
        get().dispatchDartGesture(dartName);
      }
    }
  },

  dispatchDartGesture: (name) => {
    const state = get();
    if (state.mode !== 'vrm') return;
    const seq = state._seq + 1;
    const clipName = `dart_${name}`;
    if (loadedDartClips.has(clipName)) {
      postToIframe(state.iframeRef, {
        type: 'playAnimation',
        payload: { name: clipName, loop: false, fadeIn: 0.25 },
      });
    } else {
      // First use: load the clip into the viewer's library, then request play.
      // playAnimation on a not-yet-loaded clip is a no-op (the GLB fetch is
      // async), so the first occurrence of a given gesture is silent and the
      // next plays for real — identical to the Mixamo gesture path. DART has no
      // procedural fallback, hence the accepted first-use latency.
      loadedDartClips.add(clipName);
      postToIframe(state.iframeRef, {
        type: 'loadAnimation',
        payload: { url: dartGestureUrl(name), name: clipName, retarget: true },
      });
      postToIframe(state.iframeRef, {
        type: 'playAnimation',
        payload: { name: clipName, loop: false, fadeIn: 0.25 },
      });
    }
    const cmd: ViewerCommand = {
      kind: 'gesture',
      payload: { gesture: name, expression: null },
      _seq: seq,
    };
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

  dispatchClip: (url, name, opts = {}) => {
    const state = get();
    if (state.mode !== 'vrm' || !url || !name) return;
    const seq = state._seq + 1;
    const loop = !!opts.loop;
    const fadeIn = opts.fadeIn ?? 0.25;
    if (loadedClips.has(name)) {
      postToIframe(state.iframeRef, {
        type: 'playAnimation',
        payload: { name, loop, fadeIn },
      });
    } else {
      // First use: load into the viewer's clip library, then request play.
      // playAnimation on a not-yet-loaded clip is a no-op (the GLB fetch is
      // async); the next call plays it for real — same pattern as the gesture
      // clip path. retarget:true runs the normalized-bone retarget the GLB
      // expects (the dart_to_glb output uses normalized J_Bip_* tracks).
      loadedClips.add(name);
      postToIframe(state.iframeRef, {
        type: 'loadAnimation',
        payload: { url, name, retarget: true },
      });
      postToIframe(state.iframeRef, {
        type: 'playAnimation',
        payload: { name, loop, fadeIn },
      });
    }
    const cmd: ViewerCommand = {
      kind: 'keyframes',
      payload: { clipUrl: url, name },
      _seq: seq,
    };
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchMotionResponse: (resp) => {
    if (resp && resp.kind === 'clip') {
      get().dispatchClip(resp.url, resp.name, { loop: resp.loop ?? false });
    } else {
      // Keyframes (or legacy untagged) → the existing applyKeyframes path.
      get().dispatchKeyframes(resp as unknown as Record<string, unknown>);
    }
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
    // New model = the viewer rebuilds its AnimationDirector and clip library,
    // so previously-loaded gesture clips are gone — reload them on next use.
    loadedGestureClips.clear();
    loadedDartClips.clear();
    loadedClips.clear();
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

  // ── Jiggle Physics API ──────────────────────────────────────────────────────

  /**
   * Enable or disable jiggle physics in the 3D viewer.
   *
   * @param enabled - Whether jiggle physics should be active.
   */
  dispatchSetJiggleEnabled: (enabled: boolean) => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'setJiggleEnabled', payload: { enabled }, _seq: seq };
    if (state.mode === 'vrm') postToIframe(state.iframeRef, { type: 'setJiggleEnabled', payload: { enabled } });
    set({ lastCommand: cmd, _seq: seq });
  },

  /**
   * Set jiggle intensity, optionally scoped to one body part.
   *
   * @param intensity - 0.0 (off) to 1.0 (maximum).
   * @param bodyPart - 'breast' | 'butt' | 'thigh', or omit for master intensity.
   */
  dispatchSetJiggleIntensity: (intensity: number, bodyPart?: 'breast' | 'butt' | 'thigh') => {
    const state = get();
    const seq = state._seq + 1;
    const payload = bodyPart ? { intensity, bodyPart } : { intensity };
    const cmd: ViewerCommand = { kind: 'setJiggleIntensity', payload, _seq: seq };
    if (state.mode === 'vrm') postToIframe(state.iframeRef, { type: 'setJiggleIntensity', payload });
    set({ lastCommand: cmd, _seq: seq });
  },

  /**
   * Apply a named jiggle preset.
   *
   * @param preset - 'subtle' | 'natural' | 'anime' | 'bouncy' | 'extreme'
   */
  dispatchSetJigglePreset: (preset: string) => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'setJigglePreset', payload: { preset }, _seq: seq };
    if (state.mode === 'vrm') postToIframe(state.iframeRef, { type: 'setJigglePreset', payload: { preset } });
    set({ lastCommand: cmd, _seq: seq });
  },

  /** Request current jiggle info from the viewer (response arrives as 'jiggleInfo' postMessage). */
  dispatchGetJiggleInfo: () => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'getJiggleInfo', payload: {}, _seq: seq };
    if (state.mode === 'vrm') postToIframe(state.iframeRef, { type: 'getJiggleInfo' });
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchTriggerGazeFlick: () => {
    const state = get();
    if (state.mode === 'vrm') postToIframe(state.iframeRef, { type: 'triggerGazeFlick' });
  },

  dispatchSetPersonality: (profile: Record<string, number>) => {
    const state = get();
    if (state.mode === 'vrm') postToIframe(state.iframeRef, { type: 'setPersonality', payload: profile });
  },

  dispatchSetJiggleEmotionMultiplier: (multiplier: number) => {
    const state = get();
    if (state.mode === 'vrm') postToIframe(state.iframeRef, { type: 'setJiggleEmotionMultiplier', multiplier });
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

  dispatchGaze: (gaze) => {
    const state = get();
    const seq = state._seq + 1;
    // Pure mapping → either { mode: 'cursor' } or { target: {x,y,z} }.
    const lookAt = kokoroGazeToLookAt(gaze);
    const cmd: ViewerCommand = { kind: 'gaze', payload: { gaze, ...lookAt }, _seq: seq };

    if (state.mode === 'vrm') {
      // Reuse the existing VRMLookAt postMessage API (viewer.html). The viewer
      // reads `payload.target` / `payload.mode`, so forward the mapping as-is.
      postToIframe(state.iframeRef, { type: 'lookAt', payload: lookAt });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchListeningState: (active) => {
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'listeningState', payload: { active }, _seq: seq };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'listeningState', payload: { active } });
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

  dispatchLoadEnvironment: (url) => {
    // Stage 2a: render a static room/cafe GLB behind the avatar. A null url clears
    // it (and the grounding floor), restoring the transparent-void look. Only the
    // VRM viewer supports environments — Live2D is 2D, so this is a no-op there.
    const state = get();
    const seq = state._seq + 1;
    const kind = url ? 'loadEnvironment' : 'clearEnvironment';
    const cmd: ViewerCommand = { kind, payload: { url }, _seq: seq };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'loadEnvironment', payload: { url } });
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

  // Stage 2b: Click-to-Walk Navigation ───────────────────────────────────────

  dispatchSetWalkMode: (enabled) => {
    // Enable or disable click-to-walk. Off by default — no user-visible change unless
    // a dev panel flips it. Only the VRM viewer supports walking (Live2D is 2D).
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'setWalkMode', payload: { enabled }, _seq: seq };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'setWalkMode', payload: { enabled } });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchWalkTo: (x, z) => {
    // Command the avatar to walk to world-space (x, *, z).
    // Viewer posts back avatarMoved {x, z} on arrival, walkBlocked {x, z} on collision.
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'walkTo', payload: { x, z }, _seq: seq };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'walkTo', payload: { x, z } });
    }
    set({ lastCommand: cmd, _seq: seq });
  },

  dispatchStopWalk: () => {
    // Cancel any active walk and settle the avatar to idle.
    const state = get();
    const seq = state._seq + 1;
    const cmd: ViewerCommand = { kind: 'stopWalk', payload: {}, _seq: seq };

    if (state.mode === 'vrm') {
      postToIframe(state.iframeRef, { type: 'stopWalk' });
    }
    set({ lastCommand: cmd, _seq: seq });
  },
}));
