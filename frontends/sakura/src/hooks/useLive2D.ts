import { useEffect, useRef, useCallback, useState } from 'react';
import * as PIXI from 'pixi.js';
import { Live2DModel } from 'pixi-live2d-display';
import { useViewerStore } from '../stores/viewerStore';

// Register the Live2D display module with PIXI's ticker for automatic updates
Live2DModel.registerTicker(PIXI.Ticker);

// ── Types ───────────────────────────────────────────────────────────────────────

interface UseLive2DOptions {
  /** Container element to mount the PIXI canvas into. */
  container: HTMLElement | null;
  /** Width of the rendering area (updates on resize). */
  width: number;
  /** Height of the rendering area (updates on resize). */
  height: number;
}

interface UseLive2DReturn {
  /** Load a Live2D model from a model3.json URL. */
  loadModel: (modelUrl: string) => Promise<boolean>;
  /** Set a named expression on the current model. */
  setExpression: (name: string) => void;
  /** Play a gesture/motion by mapped group name. */
  playGesture: (gesture: string) => void;
  /** Play audio with volume-based lip sync. */
  playAudio: (audioUrl: string) => void;
  /** Stop any playing audio and reset mouth. */
  stopAudio: () => void;
  /** Whether a model is currently loaded. */
  isLoaded: boolean;
}

// ── Gesture-to-motion-group mapping ─────────────────────────────────────────────

/**
 * Maps high-level gesture names (shared with VRM) to Live2D motion group names.
 * Live2D models typically define groups like "idle", "tap_body", "flick_head".
 */
const MOTION_MAP: Record<string, string> = {
  wave: 'tap_body',
  nod: 'flick_head',
  idle: 'idle',
  happy: 'tap_body',
  bow: 'tap_body',
  dance: 'tap_body',
  think: 'idle',
  laugh: 'tap_body',
  jump: 'tap_body',
};

// ── Hook ────────────────────────────────────────────────────────────────────────

/**
 * React hook that manages a Live2D Cubism model via pixi-live2d-display.
 *
 * Handles the full lifecycle: PIXI.Application creation, model loading,
 * expression/gesture dispatch, audio lip sync, resize, and cleanup.
 *
 * Subscribes to viewerStore commands so that chatStore.setCurrentEmotion(),
 * GesturePicker, and TTS audio all route through to the Live2D model.
 *
 * @param options - Container element and dimensions.
 * @returns Control methods and loaded state.
 *
 * @example
 * const containerRef = useRef<HTMLDivElement>(null);
 * const { loadModel, isLoaded } = useLive2D({
 *   container: containerRef.current,
 *   width: 600,
 *   height: 800,
 * });
 */
export function useLive2D({ container, width, height }: UseLive2DOptions): UseLive2DReturn {
  const appRef = useRef<PIXI.Application | null>(null);
  const modelRef = useRef<InstanceType<typeof Live2DModel> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const lipSyncRAFRef = useRef<number | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // ── Initialize PIXI application ──────────────────────────────────────────────

  useEffect(() => {
    if (!container) return;

    const app = new PIXI.Application({
      width,
      height,
      backgroundAlpha: 0,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    // Mount the canvas into the container
    container.appendChild(app.view as HTMLCanvasElement);
    appRef.current = app;

    return () => {
      // Cleanup: destroy PIXI app and remove canvas
      if (modelRef.current) {
        app.stage.removeChild(modelRef.current);
        modelRef.current.destroy();
        modelRef.current = null;
      }
      app.destroy(true, { children: true, texture: true, baseTexture: true });
      appRef.current = null;
      setIsLoaded(false);
    };
  }, [container]);

  // ── Resize handling ──────────────────────────────────────────────────────────

  useEffect(() => {
    const app = appRef.current;
    if (!app || width <= 0 || height <= 0) return;

    app.renderer.resize(width, height);
    fitModelToScreen();
  }, [width, height]);

  // ── Model fitting helper ─────────────────────────────────────────────────────

  const fitModelToScreen = useCallback(() => {
    const model = modelRef.current;
    const app = appRef.current;
    if (!model || !app) return;

    // Use app.screen (CSS pixels) not app.renderer (device pixels) for
    // correct scaling on retina/HiDPI displays with autoDensity enabled
    const sw = app.screen.width;
    const sh = app.screen.height;

    const scaleX = (sw * 0.85) / model.width;
    const scaleY = (sh * 0.85) / model.height;
    const scale = Math.min(scaleX, scaleY);

    model.scale.set(scale);
    model.x = (sw - model.width) / 2;
    model.y = (sh - model.height) / 2;
  }, []);

  // ── Core API methods ─────────────────────────────────────────────────────────

  const loadModel = useCallback(async (modelUrl: string): Promise<boolean> => {
    const app = appRef.current;
    if (!app) return false;

    // Remove previous model
    if (modelRef.current) {
      app.stage.removeChild(modelRef.current);
      modelRef.current.destroy();
      modelRef.current = null;
      setIsLoaded(false);
    }

    try {
      console.log(`[Live2D] Loading: ${modelUrl}`);
      const model = await Live2DModel.from(modelUrl);

      // Guard against race condition: if the PIXI app was destroyed
      // while the async load was in flight, clean up and bail out
      if (!appRef.current || appRef.current !== app) {
        model.destroy();
        return false;
      }

      modelRef.current = model;
      app.stage.addChild(model);
      fitModelToScreen();
      setIsLoaded(true);

      console.log('[Live2D] Model loaded successfully');
      return true;
    } catch (e) {
      console.error('[Live2D] Load failed:', e);
      setIsLoaded(false);
      return false;
    }
  }, [fitModelToScreen]);

  const setExpression = useCallback((name: string) => {
    const model = modelRef.current;
    if (!model) return;
    try {
      const exprMgr = (model as any).internalModel?.motionManager?.expressionManager;
      if (exprMgr) {
        exprMgr.setExpression(name);
      }
    } catch (e) {
      console.warn('[Live2D] Expression not found:', name, e);
    }
  }, []);

  const playGesture = useCallback((gesture: string) => {
    const model = modelRef.current;
    if (!model) return;
    try {
      const group = MOTION_MAP[gesture] || gesture || 'idle';
      model.motion(group, 0);
    } catch (e) {
      console.warn('[Live2D] Motion not available:', gesture, e);
    }
  }, []);

  /**
   * Set the Cubism mouth-open parameter for lip sync.
   * Drives ParamMouthOpenY (Cubism 4 standard).
   */
  const setMouthOpen = useCallback((value: number) => {
    const model = modelRef.current;
    if (!model) return;
    try {
      const coreModel = (model as any).internalModel?.coreModel;
      if (coreModel) {
        coreModel.setParameterValueById('ParamMouthOpenY', value);
      }
    } catch {
      // Parameter may not exist on all models
    }
  }, []);

  const stopAudio = useCallback(() => {
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch { /* already stopped */ }
      sourceRef.current = null;
    }
    if (lipSyncRAFRef.current) {
      cancelAnimationFrame(lipSyncRAFRef.current);
      lipSyncRAFRef.current = null;
    }
    setMouthOpen(0);
  }, [setMouthOpen]);

  const playAudio = useCallback(async (audioUrl: string) => {
    if (!modelRef.current) return;
    stopAudio();

    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
        analyserRef.current = audioCtxRef.current.createAnalyser();
        analyserRef.current.fftSize = 256;
      }

      const ctx = audioCtxRef.current;

      // Resume suspended AudioContext (browser autoplay policy)
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const analyser = analyserRef.current!;

      const response = await fetch(audioUrl);
      const buffer = await response.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(buffer);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(analyser);
      analyser.connect(ctx.destination);

      sourceRef.current = source;
      source.start(0);

      source.onended = () => {
        sourceRef.current = null;
        setMouthOpen(0);
        if (lipSyncRAFRef.current) cancelAnimationFrame(lipSyncRAFRef.current);
      };

      // Volume-based lip sync loop
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let lastValue = 0;
      const updateLipSync = () => {
        if (!sourceRef.current) return;
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;
        const normalized = Math.min(avg / 128, 1.0);
        // Smooth to avoid jitter: 70% new value + 30% previous
        const smoothed = normalized * 0.7 + lastValue * 0.3;
        lastValue = smoothed;
        setMouthOpen(smoothed);
        lipSyncRAFRef.current = requestAnimationFrame(updateLipSync);
      };
      updateLipSync();
    } catch (e) {
      console.error('[Live2D] Audio playback error:', e);
    }
  }, [stopAudio, setMouthOpen]);

  // ── Subscribe to viewerStore commands ────────────────────────────────────────

  useEffect(() => {
    const unsub = useViewerStore.subscribe((state) => {
      const cmd = state.lastCommand;
      if (!cmd || state.mode !== 'live2d') return;

      switch (cmd.kind) {
        case 'expression':
          setExpression(cmd.payload.emotion as string);
          break;
        case 'gesture':
          if (cmd.payload.gesture) playGesture(cmd.payload.gesture as string);
          if (cmd.payload.expression) setExpression(cmd.payload.expression as string);
          break;
        case 'audio':
          playAudio(cmd.payload.audioUrl as string);
          break;
        case 'loadModel':
          loadModel(cmd.payload.modelUrl as string);
          break;
      }
    });

    return unsub;
  }, [setExpression, playGesture, playAudio, loadModel]);

  // ── Cleanup audio on unmount ─────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      stopAudio();
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, [stopAudio]);

  return {
    loadModel,
    setExpression,
    playGesture,
    playAudio,
    stopAudio,
    isLoaded,
  };
}
