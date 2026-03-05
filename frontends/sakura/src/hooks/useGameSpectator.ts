/**
 * useGameSpectator — React hook for game spectator mode.
 *
 * Manages the full lifecycle: screen capture via getDisplayMedia(), frame
 * sampling with change detection, WebSocket connection to /ws/spectator,
 * and reaction event handling.
 *
 * Follows the same pattern as useFullDuplexVoice.ts — a self-contained
 * hook that owns its WebSocket connection and media stream.
 *
 * @module hooks/useGameSpectator
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useViewerStore } from '../stores/viewerStore';
import type {
  SpectatorConfig,
  SpectatorFrequency,
  SpectatorMode,
  SpectatorReaction,
  SpectatorState,
} from '../lib/types';

// ── Constants ───────────────────────────────────────────────────────────────

/** Max frames per second to sample from the screen capture. */
const MAX_FPS = 2;

/** JPEG quality for frame encoding (0.0–1.0). Lower = smaller payloads. */
const JPEG_QUALITY = 0.6;

/** Target frame width — downscale to 720p for bandwidth efficiency. */
const TARGET_WIDTH = 1280;

/** Minimum pixel histogram difference to consider a frame "changed". */
const CHANGE_THRESHOLD = 0.25;

/** Max reactions to keep in the feed history. */
const MAX_REACTIONS = 20;

// ── Types ───────────────────────────────────────────────────────────────────

/** Events received from the /ws/spectator WebSocket. */
interface SpectatorEvent {
  type: 'reaction' | 'quiet' | 'config_ack' | 'error' | 'pong';
  text?: string;
  emotion?: string;
  urgency?: number;
  message?: string;
}

export interface UseGameSpectatorOptions {
  /** Character ID for spectator reactions. */
  charId: number | null;
  /** Called when a new reaction arrives. */
  onReaction?: (reaction: SpectatorReaction) => void;
  /** Called on errors. */
  onError?: (message: string) => void;
}

export interface UseGameSpectatorReturn {
  /** Current spectator state. */
  state: SpectatorState;
  /** Whether actively capturing and sending frames. */
  isActive: boolean;
  /** Recent reactions from the character (newest first). */
  reactions: SpectatorReaction[];
  /** Start screen capture and connect to spectator WebSocket. */
  start: (config: SpectatorConfig) => Promise<void>;
  /** Stop capture and disconnect. */
  stop: () => void;
  /** Update the reaction frequency preset while active. */
  setFrequency: (freq: SpectatorFrequency) => void;
}

// ── Hook ────────────────────────────────────────────────────────────────────

/**
 * React hook for game spectator mode via WebSocket.
 *
 * Captures the user's screen (or a specific window/tab), samples frames at
 * up to 2fps with change detection, sends them as binary JPEG to the
 * /ws/spectator endpoint, and handles reaction events from the AI character.
 *
 * @param options - Hook configuration.
 * @returns Spectator controls and state.
 *
 * @example
 * ```tsx
 * const { state, start, stop, reactions } = useGameSpectator({
 *   charId: 1,
 *   onReaction: (r) => console.log(r.emotion, r.text),
 * });
 *
 * // Start spectating
 * await start({ charId: 1, gameTag: 'PokeRogue', mode: 'watch',
 *               frequency: 'normal', userName: 'Chris' });
 * ```
 */
export function useGameSpectator(options: UseGameSpectatorOptions): UseGameSpectatorReturn {
  const { charId, onReaction, onError } = options;

  const [state, setState] = useState<SpectatorState>('idle');
  const [reactions, setReactions] = useState<SpectatorReaction[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevHistogramRef = useRef<number[] | null>(null);
  const configRef = useRef<SpectatorConfig | null>(null);

  const { setExpression } = useViewerStore();

  /**
   * Compute a simple brightness histogram (8 bins) from image data
   * for change detection.
   */
  const computeHistogram = useCallback((imageData: ImageData): number[] => {
    const bins = new Array(8).fill(0);
    const data = imageData.data;
    const total = data.length / 4;
    for (let i = 0; i < data.length; i += 16) {
      // Sample every 4th pixel for speed; average RGB for brightness
      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
      const bin = Math.min(7, Math.floor(brightness / 32));
      bins[bin]++;
    }
    // Normalize
    for (let i = 0; i < bins.length; i++) bins[i] /= (total / 4);
    return bins;
  }, []);

  /**
   * Compare two histograms and return the difference (0.0–1.0).
   */
  const histogramDiff = useCallback((a: number[], b: number[]): number => {
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff += Math.abs(a[i] - b[i]);
    return diff / 2; // Normalize to 0–1
  }, []);

  /**
   * Capture a single frame from the screen stream, encode as JPEG,
   * and send to the WebSocket if the frame changed significantly.
   */
  const captureAndSendFrame = useCallback(() => {
    const stream = streamRef.current;
    const ws = wsRef.current;
    if (!stream || !ws || ws.readyState !== WebSocket.OPEN) return;

    const track = stream.getVideoTracks()[0];
    if (!track || track.readyState !== 'live') return;

    // Use canvas to capture + encode
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Create a video element to draw the current frame
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;

    // Use ImageCapture API if available (more efficient)
    // @ts-expect-error ImageCapture may not be in TS types
    if (typeof ImageCapture !== 'undefined') {
      // @ts-expect-error ImageCapture may not be in TS types
      const capture = new ImageCapture(track);
      capture.grabFrame().then((bitmap: ImageBitmap) => {
        // Scale to target width
        const scale = Math.min(1, TARGET_WIDTH / bitmap.width);
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();

        // Change detection
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const histogram = computeHistogram(imageData);

        if (prevHistogramRef.current) {
          const diff = histogramDiff(prevHistogramRef.current, histogram);
          if (diff < CHANGE_THRESHOLD) return; // Frame hasn't changed enough
        }
        prevHistogramRef.current = histogram;

        // Encode and send
        canvas.toBlob(
          (blob) => {
            if (blob && ws.readyState === WebSocket.OPEN) {
              ws.send(blob);
            }
          },
          'image/jpeg',
          JPEG_QUALITY,
        );
      }).catch(() => {
        // ImageCapture not supported or failed — skip this frame
      });
    }
  }, [computeHistogram, histogramDiff]);

  /**
   * Handle incoming WebSocket messages (reactions, errors, etc.).
   */
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const msg: SpectatorEvent = JSON.parse(event.data);

      if (msg.type === 'reaction' && msg.text) {
        const reaction: SpectatorReaction = {
          text: msg.text,
          emotion: msg.emotion || 'neutral',
          urgency: msg.urgency || 0.5,
          timestamp: Date.now(),
        };

        setReactions((prev) => [reaction, ...prev].slice(0, MAX_REACTIONS));
        onReaction?.(reaction);

        // Dispatch emotion to the viewer for expression animation
        setExpression(reaction.emotion, reaction.urgency);
      } else if (msg.type === 'error') {
        onError?.(msg.message || 'Spectator error');
      } else if (msg.type === 'config_ack') {
        setState('capturing');
      }
    } catch {
      // Non-JSON message — ignore
    }
  }, [onReaction, onError, setExpression]);

  /**
   * Start screen capture and connect to the spectator WebSocket.
   */
  const start = useCallback(async (config: SpectatorConfig) => {
    if (state === 'capturing') return;
    configRef.current = config;
    setState('connecting');

    try {
      // Request screen capture
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: TARGET_WIDTH },
          height: { ideal: 720 },
          frameRate: { ideal: MAX_FPS, max: MAX_FPS },
        },
        audio: false,
      });
      streamRef.current = stream;

      // Handle user stopping share via browser UI
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        stop();
      });

      // Connect WebSocket
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname || 'localhost';
      const wsUrl = `${protocol}//${host}:8080/ws/spectator?char_id=${config.charId}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        // Send config frame
        ws.send(JSON.stringify({
          type: 'config',
          char_id: config.charId,
          game_tag: config.gameTag,
          mode: config.mode,
          frequency: config.frequency,
          user_name: config.userName,
        }));

        // Start frame sampling timer
        const intervalMs = Math.round(1000 / MAX_FPS);
        timerRef.current = setInterval(captureAndSendFrame, intervalMs);
      };

      ws.onmessage = handleMessage;

      ws.onerror = () => {
        setState('error');
        onError?.('WebSocket connection error');
      };

      ws.onclose = () => {
        if (state === 'capturing') {
          setState('idle');
        }
      };

    } catch (err) {
      setState('error');
      onError?.(err instanceof Error ? err.message : 'Failed to start screen capture');
      stop();
    }
  }, [state, captureAndSendFrame, handleMessage, onError]);

  /**
   * Stop capture and disconnect.
   */
  const stop = useCallback(() => {
    // Stop frame timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Stop screen capture
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    // Close WebSocket
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }

    prevHistogramRef.current = null;
    setState('idle');
  }, []);

  /**
   * Update the reaction frequency without reconnecting.
   */
  const setFrequency = useCallback((freq: SpectatorFrequency) => {
    if (wsRef.current?.readyState === WebSocket.OPEN && configRef.current) {
      configRef.current.frequency = freq;
      wsRef.current.send(JSON.stringify({
        type: 'config',
        ...configRef.current,
        char_id: configRef.current.charId,
        game_tag: configRef.current.gameTag,
        user_name: configRef.current.userName,
        frequency: freq,
      }));
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    state,
    isActive: state === 'capturing',
    reactions,
    start,
    stop,
    setFrequency,
  };
}
