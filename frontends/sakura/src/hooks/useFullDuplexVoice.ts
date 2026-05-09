import { useCallback, useEffect, useRef, useState } from 'react';
import { useViewerStore } from '../stores/viewerStore';

// ── Types ───────────────────────────────────────────────────────────────────────

/** Voice session states matching the server's SessionState enum. */
export type VoiceSessionState = 'disconnected' | 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

/** Events received from the /ws/voice WebSocket. */
export interface VoiceEvent {
  type: 'state' | 'transcript' | 'ai_token' | 'ai_text' | 'emotion' | 'interrupted' | 'error' | 'pong' | 'config_ack';
  state?: string;
  text?: string;
  role?: string;
  emotion?: string;
  intensity?: number;
  message?: string;
  ts?: number;
}

/** Runtime config for the full-duplex voice session (sent to server on connect). */
export interface VoiceDuplexConfig {
  /** Silence timeout in ms before utterance is processed (200–10000). */
  silenceTimeoutMs?: number;
  /** VAD energy threshold for speech detection (0.001–0.5). */
  vadThreshold?: number;
}

export interface UseFullDuplexVoiceOptions {
  /** Chat session ID for message persistence. */
  sessionId: number | null;
  /** Character ID for LLM persona + TTS voice. */
  charId: number | null;
  /** Runtime voice config to send to the server on connect. */
  voiceConfig?: VoiceDuplexConfig;
  /** Called when the user's speech is transcribed. */
  onTranscript?: (text: string) => void;
  /** Called as AI tokens stream in (for live transcript). */
  onAIToken?: (token: string) => void;
  /** Called when the AI's full response is ready. */
  onAIResponse?: (text: string, emotion?: string) => void;
  /** Called on any error event. */
  onError?: (message: string) => void;
}

export interface UseFullDuplexVoiceReturn {
  /** Current state of the voice session. */
  state: VoiceSessionState;
  /** Whether the WebSocket is connected and mic is streaming. */
  isActive: boolean;
  /** Connect to the voice WebSocket and start streaming mic audio. */
  connect: () => Promise<void>;
  /** Disconnect from the voice WebSocket and stop mic capture. */
  disconnect: () => void;
  /** Toggle between connected and disconnected. */
  toggle: () => Promise<void>;
  /** Send an interrupt (barge-in) to stop AI speech. */
  interrupt: () => void;
  /** Current audio input level (0-1), for VoiceOrb visualization. */
  inputLevel: number;
  /** Current audio output level (0-1), for VoiceOrb speaking glow. */
  outputLevel: number;
}

// ── Constants ───────────────────────────────────────────────────────────────────

/** MediaRecorder timeslice — how often data is emitted (ms). */
const TIMESLICE_MS = 100;

/** Audio input level update interval for the VoiceOrb visualization. */
const LEVEL_UPDATE_MS = 50;

// ── Hook ────────────────────────────────────────────────────────────────────────

/**
 * React hook for full-duplex voice conversation via WebSocket.
 *
 * Manages the entire lifecycle: WebSocket connection, mic capture via
 * MediaRecorder, binary audio streaming to the server, and handling
 * of JSON control events and binary TTS audio from the server.
 *
 * Audio from the server is played through the Web Audio API, and the
 * viewerStore is notified for lip sync on VRM/Live2D models.
 *
 * @param options - Session IDs, character ID, and event callbacks.
 * @returns Connection state, control methods, and input level.
 *
 * @example
 * const { state, connect, disconnect, interrupt, inputLevel } = useFullDuplexVoice({
 *   sessionId: 1,
 *   charId: 1,
 *   onTranscript: (text) => console.log('User said:', text),
 *   onAIResponse: (text) => console.log('AI replied:', text),
 * });
 */
export function useFullDuplexVoice(options: UseFullDuplexVoiceOptions): UseFullDuplexVoiceReturn {
  const { sessionId, charId } = options;

  const [state, setState] = useState<VoiceSessionState>('disconnected');
  const [inputLevel, setInputLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const playbackAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputLevelRAFRef = useRef<number | null>(null);
  const levelIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks whether first_voice achievement was granted this hook lifetime (per-charId).
  const firstVoiceGrantedRef = useRef(false);

  // Refs for stable callback access in WebSocket handlers
  const callbacksRef = useRef(options);
  callbacksRef.current = options;

  // ── Audio playback queue ──────────────────────────────────────────────────

  const playbackQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);

  /**
   * Start a RAF loop that measures playback audio level via the playback analyser.
   * Updates outputLevel state for VoiceOrb speaking glow.
   */
  const startOutputLevelMonitor = useCallback(() => {
    const analyser = playbackAnalyserRef.current;
    if (!analyser) return;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const update = () => {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      const avg = sum / dataArray.length;
      setOutputLevel(Math.min(avg / 128, 1.0));
      outputLevelRAFRef.current = requestAnimationFrame(update);
    };
    update();
  }, []);

  const stopOutputLevelMonitor = useCallback(() => {
    if (outputLevelRAFRef.current) {
      cancelAnimationFrame(outputLevelRAFRef.current);
      outputLevelRAFRef.current = null;
    }
    setOutputLevel(0);
  }, []);

  /**
   * Play audio from an ArrayBuffer (TTS chunk from the server).
   * Queues multiple chunks and plays sequentially.
   */
  const playAudio = useCallback(async (audioBuffer: ArrayBuffer) => {
    playbackQueueRef.current.push(audioBuffer);
    if (isPlayingRef.current) return;

    isPlayingRef.current = true;

    while (playbackQueueRef.current.length > 0) {
      const buf = playbackQueueRef.current.shift()!;
      try {
        if (!audioCtxRef.current) {
          audioCtxRef.current = new AudioContext();
        }
        const ctx = audioCtxRef.current;

        // Resume suspended AudioContext (browser autoplay policy)
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }

        // Create playback analyser for output level measurement
        if (!playbackAnalyserRef.current) {
          playbackAnalyserRef.current = ctx.createAnalyser();
          playbackAnalyserRef.current.fftSize = 256;
          playbackAnalyserRef.current.connect(ctx.destination);
        }

        const decoded = await ctx.decodeAudioData(buf.slice(0)); // slice for ownership
        const source = ctx.createBufferSource();
        source.buffer = decoded;
        source.connect(playbackAnalyserRef.current);
        activeSourceRef.current = source;

        startOutputLevelMonitor();

        await new Promise<void>((resolve) => {
          source.onended = () => {
            activeSourceRef.current = null;
            resolve();
          };
          source.start(0);
        });
      } catch (e) {
        console.warn('[Voice] Audio playback error:', e);
        activeSourceRef.current = null;
      }
    }

    stopOutputLevelMonitor();
    isPlayingRef.current = false;
  }, [startOutputLevelMonitor, stopOutputLevelMonitor]);

  // ── Input level monitoring ────────────────────────────────────────────────

  const startLevelMonitor = useCallback(() => {
    if (!analyserRef.current) return;
    const analyser = analyserRef.current;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    levelIntervalRef.current = setInterval(() => {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      const avg = sum / dataArray.length;
      setInputLevel(Math.min(avg / 128, 1.0));
    }, LEVEL_UPDATE_MS);
  }, []);

  const stopLevelMonitor = useCallback(() => {
    if (levelIntervalRef.current) {
      clearInterval(levelIntervalRef.current);
      levelIntervalRef.current = null;
    }
    setInputLevel(0);
  }, []);

  // ── Connect ───────────────────────────────────────────────────────────────

  const connect = useCallback(async () => {
    if (wsRef.current || sessionId == null || !charId) return;

    // Request microphone access
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        },
      });
    } catch (e) {
      callbacksRef.current.onError?.('Microphone access denied');
      return;
    }
    streamRef.current = stream;

    // Reuse existing AudioContext or create one for input level monitoring + playback
    const audioCtx = audioCtxRef.current ?? new AudioContext();
    audioCtxRef.current = audioCtx;
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = analyser;
    startLevelMonitor();

    // Connect WebSocket
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${location.host}/ws/voice?session_id=${sessionId}&char_id=${charId}`;
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      // Successful connection — reset reconnect counter
      reconnectAttemptsRef.current = 0;

      // Send runtime voice config to the server
      const vc = callbacksRef.current.voiceConfig;
      if (vc) {
        const configMsg: Record<string, unknown> = { type: 'control', action: 'config' };
        if (vc.silenceTimeoutMs !== undefined) configMsg.silence_timeout_ms = vc.silenceTimeoutMs;
        if (vc.vadThreshold !== undefined) configMsg.vad_threshold = vc.vadThreshold;
        ws.send(JSON.stringify(configMsg));
      }

      // Start MediaRecorder for 100ms WebM/Opus chunks
      const recorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
          e.data.arrayBuffer().then((buf) => {
            ws.send(buf);
          });
        }
      };

      recorder.start(TIMESLICE_MS);
      recorderRef.current = recorder;
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        // Binary frame: TTS audio chunk
        playAudio(event.data);
        return;
      }

      // Text frame: JSON control event
      try {
        const msg = JSON.parse(event.data) as VoiceEvent;
        handleEvent(msg);
      } catch {
        // Non-JSON text frame — ignore
      }
    };

    ws.onerror = () => {
      setState('error');
      callbacksRef.current.onError?.('Voice WebSocket connection error');
    };

    ws.onclose = (event) => {
      cleanup();

      // Attempt reconnection on abnormal closure (not manual disconnect)
      // Code 1000 = normal close, 1005 = no status (browser-initiated)
      const isAbnormal = event.code !== 1000;
      const maxAttempts = 5;

      if (isAbnormal && reconnectAttemptsRef.current < maxAttempts) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
        reconnectAttemptsRef.current++;
        console.log(`[Voice] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${maxAttempts})`);
        setState('disconnected');
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null;
          connect();
        }, delay);
      } else {
        // Max reconnect attempts exhausted or user-initiated close
        reconnectAttemptsRef.current = 0;
        setState(isAbnormal ? 'error' : 'disconnected');
      }
    };
  }, [sessionId, charId, startLevelMonitor, playAudio]);

  // ── Event handler ─────────────────────────────────────────────────────────

  const handleEvent = useCallback((msg: VoiceEvent) => {
    switch (msg.type) {
      case 'state':
        if (msg.state) {
          setState(msg.state as VoiceSessionState);
        }
        break;

      case 'transcript':
        if (msg.text) {
          callbacksRef.current.onTranscript?.(msg.text);
        }
        break;

      case 'ai_token':
        if (msg.text) {
          callbacksRef.current.onAIToken?.(msg.text);
        }
        break;

      case 'ai_text':
        if (msg.text) {
          callbacksRef.current.onAIResponse?.(msg.text, msg.emotion ?? undefined);
        }
        // Drive expression on the 3D viewer
        if (msg.emotion) {
          useViewerStore.getState().dispatchExpression(msg.emotion, msg.intensity ?? 1.0);
        }
        // M6-item21: first_voice achievement — first complete AI reply in a voice session
        if (!firstVoiceGrantedRef.current && callbacksRef.current.charId != null) {
          firstVoiceGrantedRef.current = true;
          import('../lib/api').then(({ api: _api }) =>
            import('../stores/appStore').then(({ useAppStore }) =>
              _api.grantAchievement(callbacksRef.current.charId!, 'first_voice').then((res) => {
                if (res.granted) useAppStore.getState().setPendingAchievement(res.achievement);
              }).catch(() => {})
            )
          );
        }
        break;

      case 'emotion':
        if (msg.emotion) {
          useViewerStore.getState().dispatchExpression(msg.emotion, msg.intensity ?? 1.0);
        }
        break;

      case 'interrupted':
        // Stop currently-playing source and clear playback queue on barge-in
        if (activeSourceRef.current) {
          try { activeSourceRef.current.stop(); } catch { /* already stopped */ }
          activeSourceRef.current = null;
        }
        playbackQueueRef.current = [];
        break;

      case 'error':
        setState('error');
        callbacksRef.current.onError?.(msg.message || 'Unknown error');
        break;
    }
  }, []);

  // ── Disconnect ────────────────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    // Cancel any pending reconnect
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    // Stop MediaRecorder
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    recorderRef.current = null;

    // Stop mic stream
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Stop level monitor
    stopLevelMonitor();

    // Stop active audio source
    if (activeSourceRef.current) {
      try { activeSourceRef.current.stop(); } catch { /* already stopped */ }
      activeSourceRef.current = null;
    }

    // Stop output level monitor
    if (outputLevelRAFRef.current) {
      cancelAnimationFrame(outputLevelRAFRef.current);
      outputLevelRAFRef.current = null;
    }
    setOutputLevel(0);

    // Close audio context
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    playbackAnalyserRef.current = null;

    // Clear playback queue
    playbackQueueRef.current = [];
    isPlayingRef.current = false;
  }, [stopLevelMonitor]);

  const disconnect = useCallback(() => {
    // Reset reconnect counter to prevent auto-reconnection on manual disconnect
    reconnectAttemptsRef.current = 0;
    cleanup();
    setState('disconnected');
  }, [cleanup]);

  const toggle = useCallback(async () => {
    if (wsRef.current) {
      disconnect();
    } else {
      await connect();
    }
  }, [connect, disconnect]);

  // ── Interrupt (barge-in) ──────────────────────────────────────────────────

  const interrupt = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'control', action: 'interrupt' }));
    }
    // Stop active audio source and clear playback queue
    if (activeSourceRef.current) {
      try { activeSourceRef.current.stop(); } catch { /* already stopped */ }
      activeSourceRef.current = null;
    }
    playbackQueueRef.current = [];
  }, []);

  // ── Cleanup on unmount ────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    state,
    isActive: state !== 'disconnected',
    connect,
    disconnect,
    toggle,
    interrupt,
    inputLevel,
    outputLevel,
  };
}
