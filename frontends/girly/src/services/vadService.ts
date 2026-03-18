/**
 * VAD (Voice Activity Detection) service.
 *
 * Wraps `@ricky0123/vad-web` to emit speech-start and speech-end events
 * when the user starts/stops speaking into the microphone. Used by the
 * voice interruption feature to let users cut off the AI mid-speech.
 *
 * The VAD runs continuously while enabled, using ONNX runtime in the browser
 * for low-latency speech detection without server round-trips.
 *
 * @example
 *   const vad = new VADService();
 *   vad.on('speech-start', () => pauseTTS());
 *   vad.on('speech-end', (audio) => routeToSTT(audio));
 *   await vad.start();
 */

type VADEventMap = {
  'speech-start': () => void;
  'speech-end': (audio: Float32Array) => void;
  'error': (error: Error) => void;
};

type VADEventName = keyof VADEventMap;

interface MicVADInstance {
  start: () => void;
  pause: () => void;
  destroy: () => void;
}

export class VADService {
  private vad: MicVADInstance | null = null;
  private listeners = new Map<VADEventName, Set<VADEventMap[VADEventName]>>();
  private _isListening = false;

  /** Whether the VAD is actively monitoring the microphone. */
  get isListening(): boolean {
    return this._isListening;
  }

  /**
   * Register an event listener.
   *
   * @param event - 'speech-start', 'speech-end', or 'error'.
   * @param callback - Handler function.
   */
  on<E extends VADEventName>(event: E, callback: VADEventMap[E]): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback as VADEventMap[VADEventName]);
  }

  /** Remove an event listener. */
  off<E extends VADEventName>(event: E, callback: VADEventMap[E]): void {
    this.listeners.get(event)?.delete(callback as VADEventMap[VADEventName]);
  }

  private emit<E extends VADEventName>(event: E, ...args: Parameters<VADEventMap[E]>): void {
    const handlers = this.listeners.get(event);
    if (!handlers) return;
    for (const handler of handlers) {
      (handler as (...a: Parameters<VADEventMap[E]>) => void)(...args);
    }
  }

  /**
   * Initialize and start the VAD microphone monitor.
   *
   * Dynamically imports `@ricky0123/vad-web` so the ONNX model is only
   * loaded when voice interruption is actually enabled.
   */
  async start(): Promise<void> {
    if (this.vad) return;

    try {
      const vadModule = await import('@ricky0123/vad-web');
      const MicVAD = vadModule.MicVAD;

      this.vad = await MicVAD.new({
        onSpeechStart: () => {
          this.emit('speech-start');
        },
        onSpeechEnd: (audio: Float32Array) => {
          this.emit('speech-end', audio);
        },
        // Require 250ms of speech to trigger (reduces false positives).
        positiveSpeechThreshold: 0.8,
        negativeSpeechThreshold: 0.35,
        minSpeechFrames: 5,
        // Pre-speech padding so we don't clip the beginning of words.
        redemptionFrames: 8,
      });

      this.vad.start();
      this._isListening = true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit('error', error);
      console.warn('[VADService] Failed to initialize:', error.message);
    }
  }

  /** Pause the VAD without destroying it (can be resumed). */
  pause(): void {
    this.vad?.pause();
    this._isListening = false;
  }

  /** Resume after pause. */
  resume(): void {
    this.vad?.start();
    this._isListening = true;
  }

  /** Completely destroy the VAD instance and release the microphone. */
  destroy(): void {
    this.vad?.destroy();
    this.vad = null;
    this._isListening = false;
    this.listeners.clear();
  }
}

/** Singleton VAD instance shared across the app. */
export const globalVAD = new VADService();
