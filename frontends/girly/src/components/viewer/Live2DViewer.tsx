/**
 * Live2DViewer – PixiJS-based Live2D / Cubism model renderer.
 *
 * Drop-in alternative to {@link ThreeViewer} that renders Live2D Cubism2 or
 * Cubism4 models via {@link https://github.com/guansss/pixi-live2d-display | pixi-live2d-display}.
 *
 * Avatar runtime signals flow in from AppContext and are translated to
 * Cubism parameter values by {@link live2dParameterMap} every animation
 * frame.  The rendering loop respects the same 30 FPS cap and telemetry
 * contract as ThreeViewer so the Dev-Mode panel works without modification.
 *
 * Lifecycle:
 *   1. Mount → create `PIXI.Application`, start RAF loop, kick off async model load.
 *   2. Model ready → center & scale to container, begin parameter injection.
 *   3. Resize → `ResizeObserver` on the container div tells the PIXI renderer
 *      to resize and re-centers the model.
 *   4. Unmount → cancel RAF, destroy model, destroy PIXI app.
 */

import { useEffect, useRef } from 'react';
import * as PIXI from 'pixi.js';
import { Live2DModel, type Cubism2InternalModel, type Cubism4InternalModel } from 'pixi-live2d-display';
import { useApp } from '@/context/AppContext.tsx';
import { resolveAvatarPresentation } from '@/services/avatarPerformanceService.ts';
import {
  emotionToLive2DParams,
  gazeToLive2DParams,
  gestureToLive2DParams,
  mergeParameterSets,
  type Live2DParameterSet,
} from '@/services/live2dParameterMap.ts';

/* ── Ticker registration ─────────────────────────────────────────────────── */

// Register PIXI.Ticker with pixi-live2d-display so the library can drive its
// own internal motion/expression update loop automatically.
Live2DModel.registerTicker(PIXI.Ticker);

/* ── Constants ───────────────────────────────────────────────────────────── */

/** Target frame-rate — must match ThreeViewer. */
const TARGET_FPS     = 30;
/** Minimum ms between drawn frames. */
const FRAME_INTERVAL = 1000 / TARGET_FPS;
/** Rolling FPS sample window length — must match ThreeViewer. */
const FPS_SAMPLE_SIZE = 60;

/* ── Type guards for Cubism variant detection ────────────────────────────── */

/**
 * Returns `true` when the internal model's core model has the Cubism4
 * `setParameterValueById` method, indicating a `.model3.json` model.
 *
 * @param coreModel - The opaque `coreModel` object from `InternalModel`.
 * @returns Whether the core model is a Cubism4 `CubismModel`.
 */
function isCubism4CoreModel(
  coreModel: object,
): coreModel is Cubism4InternalModel['coreModel'] {
  return (
    typeof (coreModel as Record<string, unknown>)['setParameterValueById'] === 'function'
  );
}

/**
 * Returns `true` when the internal model's core model has the Cubism2
 * `setParamFloat` method, indicating a `.model.json` model.
 *
 * @param coreModel - The opaque `coreModel` object from `InternalModel`.
 * @returns Whether the core model is a Cubism2 `Live2DModelWebGL`.
 */
function isCubism2CoreModel(
  coreModel: object,
): coreModel is Cubism2InternalModel['coreModel'] {
  return (
    typeof (coreModel as Record<string, unknown>)['setParamFloat'] === 'function'
  );
}

/* ── Parameter application ───────────────────────────────────────────────── */

/**
 * Applies a merged parameter set to a Live2D model's core, handling both
 * Cubism2 (`setParamFloat`) and Cubism4 (`setParameterValueById`) APIs.
 *
 * Silently no-ops if the internal model or core model is not yet initialised.
 *
 * @param model  - The loaded `Live2DModel` instance.
 * @param params - Flat map of parameter IDs to their target values.
 */
function applyParameters(model: Live2DModel, params: Live2DParameterSet): void {
  // internalModel is non-null only after the "ready" event — guard defensively.
  const internal = model.internalModel as Live2DModel['internalModel'] | undefined;
  if (!internal) return;

  const core = internal.coreModel;

  if (isCubism4CoreModel(core)) {
    for (const [id, value] of Object.entries(params)) {
      core.setParameterValueById(id, value);
    }
  } else if (isCubism2CoreModel(core)) {
    for (const [id, value] of Object.entries(params)) {
      core.setParamFloat(id, value);
    }
  }
}

/* ── Component ───────────────────────────────────────────────────────────── */

/**
 * Props for the Live2DViewer component.
 */
export interface Live2DViewerProps {
  /**
   * Path or URL to the Live2D model settings file.
   * Cubism4: `.model3.json`  |  Cubism2: `.model.json`
   */
  modelUrl: string;
}

/**
 * Live2DViewer — PixiJS application that renders a Live2D Cubism avatar and
 * drives it with AnimeGirly's avatar runtime state.
 *
 * The component mounts a `<div>` container and creates a `PIXI.Application`
 * whose `<canvas>` is appended into it.  A `ResizeObserver` keeps the
 * renderer synced to the container's CSS size.  The animation loop reads
 * avatar state from AppContext on every frame and injects Cubism parameters
 * derived by the parameter-map service.
 *
 * @param props.modelUrl - URL of the `.model3.json` or `.model.json` file.
 */
export default function Live2DViewer({ modelUrl }: Live2DViewerProps) {
  const { state: appState, dispatch: appDispatch } = useApp();

  /* ── Container / stable-ref for the mounting div ── */
  const containerRef = useRef<HTMLDivElement>(null);

  /* ── PixiJS app + model refs (never cause React re-renders) ── */
  const pixiAppRef = useRef<PIXI.Application | null>(null);
  const modelRef   = useRef<Live2DModel | null>(null);

  /* ── RAF / telemetry refs ── */
  const rafRef      = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const fpsRef      = useRef<number[]>([]);

  /* ── Stable refs for fast per-frame reads without stale closures ── */
  const avatarRef  = useRef(appState.avatar);
  const devModeRef = useRef(appState.devMode);

  useEffect(() => { avatarRef.current = appState.avatar;  }, [appState.avatar]);
  useEffect(() => { devModeRef.current = appState.devMode; }, [appState.devMode]);

  /* ── PIXI application + model lifecycle ────────────────────────────────── */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    /* Create PIXI application with a transparent background so the shell's
       gradient or room environment shows through. */
    const app = new PIXI.Application({
      width:           container.clientWidth  || 400,
      height:          container.clientHeight || 600,
      backgroundAlpha: 0,
      antialias:       true,
      resolution:      Math.min(window.devicePixelRatio, 2),
      autoDensity:     true,
    });

    // Mount the PixiJS canvas into our container div.
    container.appendChild(app.view as HTMLCanvasElement);
    pixiAppRef.current = app;

    /* ── Load the Live2D model ── */
    let cancelled = false;

    async function loadModel() {
      try {
        const live2dModel = await Live2DModel.from(modelUrl);

        if (cancelled) {
          // Effect cleanup ran before the async load resolved — discard.
          live2dModel.destroy();
          return;
        }

        // Center and scale the model to fill the container.
        scaleModelToContainer(live2dModel, app.screen.width, app.screen.height);

        app.stage.addChild(live2dModel);
        modelRef.current = live2dModel;
      } catch (err) {
        if (!cancelled) {
          // Surface load failures visibly in development.
          console.error('[Live2DViewer] Failed to load model:', modelUrl, err);
        }
      }
    }

    void loadModel();

    /* ── RAF animation loop ── */
    const loop = (timestamp: number) => {
      rafRef.current = requestAnimationFrame(loop);

      /* FPS gate — identical to TwoDViewer / ThreeViewer. */
      const elapsed = timestamp - lastTimeRef.current;
      if (elapsed < FRAME_INTERVAL) return;
      lastTimeRef.current = timestamp - (elapsed % FRAME_INTERVAL);

      const live2dModel = modelRef.current;
      if (live2dModel) {
        /* Resolve the current avatar presentation frame. */
        const frame = resolveAvatarPresentation(avatarRef.current, Date.now());
        const av    = avatarRef.current;

        /* Map AnimeGirly avatar state → Cubism parameters.
           Gaze overrides emotion-derived angles (last-wins merge). */
        const params = mergeParameterSets(
          emotionToLive2DParams(av.emotion, av.energy, av.intimacy),
          gazeToLive2DParams(av.gaze),
          gestureToLive2DParams(av.gesture),
        );

        /* Scale mouth open by talk intensity when the model is speaking. */
        if (frame.phase === 'speaking' || frame.phase === 'reacting') {
          params['ParamMouthOpenY'] =
            (params['ParamMouthOpenY'] ?? 0) * av.talkIntensity;
        }

        applyParameters(live2dModel, params);
      }

      /* ── FPS telemetry — identical rolling-window approach as ThreeViewer ── */
      fpsRef.current.push(timestamp);
      if (fpsRef.current.length > FPS_SAMPLE_SIZE) fpsRef.current.shift();

      if (fpsRef.current.length >= 2 && devModeRef.current) {
        const span   = fpsRef.current[fpsRef.current.length - 1] - fpsRef.current[0];
        const avgFps = (fpsRef.current.length - 1) / (span / 1000);
        appDispatch({
          type: 'UPDATE_METRICS',
          payload: {
            currentFps: Math.round(1000 / elapsed),
            averageFps: Math.round(avgFps),
          },
        });
      }
    };

    rafRef.current = requestAnimationFrame(loop);

    /* ── Cleanup ── */
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);

      const live2dModel = modelRef.current;
      if (live2dModel) {
        live2dModel.destroy();
        modelRef.current = null;
      }

      app.destroy(true, { children: true, texture: true, baseTexture: true });
      pixiAppRef.current = null;
    };
  }, [appDispatch, modelUrl]); // Re-run when modelUrl changes to reload the model.

  /* ── ResizeObserver — keeps the PIXI renderer sized to its container ─── */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;

      const { width, height } = entry.contentRect;
      const app   = pixiAppRef.current;
      const model = modelRef.current;

      if (app) {
        app.renderer.resize(width, height);
      }

      if (model && width > 0 && height > 0) {
        scaleModelToContainer(model, width, height);
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  /* ── JSX ── */
  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #ede5ff 0%, #faf5ff 100%)' }}
    />
  );
}

/* ── Layout helpers ──────────────────────────────────────────────────────── */

/**
 * Centers and uniformly scales a `Live2DModel` to fill `canvasW × canvasH`
 * while preserving the model's original aspect ratio (contain-fit).
 *
 * The model's anchor is set to `(0.5, 0.5)` so that repositioning after
 * resize is simply setting `x = canvasW/2`, `y = canvasH/2`.
 *
 * @param model    - The loaded `Live2DModel` to reposition.
 * @param canvasW  - Target canvas width in logical pixels.
 * @param canvasH  - Target canvas height in logical pixels.
 */
function scaleModelToContainer(
  model: Live2DModel,
  canvasW: number,
  canvasH: number,
): void {
  if (canvasW <= 0 || canvasH <= 0) return;

  // Use the model's internal canvas dimensions for the source aspect ratio.
  const modelW = model.internalModel?.originalWidth  || model.width  || canvasW;
  const modelH = model.internalModel?.originalHeight || model.height || canvasH;

  if (modelW <= 0 || modelH <= 0) return;

  const scaleX = canvasW / modelW;
  const scaleY = canvasH / modelH;
  const scale  = Math.min(scaleX, scaleY) * 0.9; // 90 % — a small breathing margin.

  model.scale.set(scale);
  model.anchor.set(0.5, 0.5);
  model.x = canvasW / 2;
  model.y = canvasH / 2;
}
