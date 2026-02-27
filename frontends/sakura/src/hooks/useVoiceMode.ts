import { useCallback, useEffect, useRef, useState } from 'react';

/** Possible states of the voice input pipeline. */
export type VoiceState = 'idle' | 'listening' | 'processing';

interface UseVoiceModeOptions {
  /**
   * Called with the final transcription text.
   * Typically wired to sendMessage or setDraft.
   *
   * @param text - The transcribed speech
   * @param autoSend - If true, the caller should send immediately (voice mode
   *   auto-sends on silence); if false, just populate the draft.
   */
  onTranscribed: (text: string, autoSend: boolean) => void;
  /** Optional callback fired when audio activity is first detected. */
  onSpeechStart?: () => void;
  /**
   * RMS-equivalent amplitude threshold (0–255, Uint8 frequency domain).
   * Values above this are considered speech. Default: 18.
   */
  silenceThreshold?: number;
  /**
   * How long (ms) audio must stay below the threshold before we consider
   * the utterance complete and send it to ASR. Default: 1500.
   */
  silenceMs?: number;
}

/**
 * Hook that manages a full voice-input pipeline:
 *   getUserMedia → AudioContext VAD → MediaRecorder → ASR → onTranscribed
 *
 * Uses amplitude-based Voice Activity Detection (VAD) via the Web Audio API
 * AnalyserNode — no external libraries required.  The VAD detects speech onset
 * and silence, automatically chunking audio at natural pause boundaries.
 *
 * @param options - Configuration and callbacks.
 * @returns Controls and current state for the voice pipeline.
 *
 * @example
 * const { voiceActive, voiceState, toggleVoiceMode } = useVoiceMode({
 *   onTranscribed: (text, autoSend) => {
 *     if (autoSend) sendMessage(text);
 *     else setDraft(text);
 *   },
 * });
 */
export function useVoiceMode({
  onTranscribed,
  onSpeechStart,
  silenceThreshold = 18,
  silenceMs = 1500,
}: UseVoiceModeOptions) {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [voiceActive, setVoiceActive] = useState(false);

  // Mutable refs — avoids stale closures in the rAF loop and async callbacks
  const streamRef      = useRef<MediaStream | null>(null);
  const recorderRef    = useRef<MediaRecorder | null>(null);
  const audioCtxRef    = useRef<AudioContext | null>(null);
  const analyserRef    = useRef<AnalyserNode | null>(null);
  const freqBufRef     = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const chunksRef      = useRef<Blob[]>([]);
  const silenceTimerRef= useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef         = useRef<number | null>(null);
  const speakingRef    = useRef(false);
  const activeRef      = useRef(false);  // mirrors voiceActive without re-render lag

  /** Tear down every resource and return to idle. */
  const stopAll = useCallback(() => {
    activeRef.current = false;
    setVoiceActive(false);
    setVoiceState('idle');

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') {
      try { rec.stop(); } catch { /* ignore */ }
    }

    streamRef.current?.getTracks().forEach(t => t.stop());

    audioCtxRef.current?.close().catch(() => {});

    rafRef.current      = null;
    silenceTimerRef.current = null;
    streamRef.current   = null;
    recorderRef.current = null;
    audioCtxRef.current = null;
    analyserRef.current = null;
    freqBufRef.current  = null;
    speakingRef.current = false;
    chunksRef.current   = [];
  }, []);

  /**
   * Send accumulated audio chunks to the backend ASR endpoint and fire
   * onTranscribed with the result.
   */
  const transcribeChunk = useCallback(async (chunks: Blob[]) => {
    if (chunks.length === 0) return;

    setVoiceState('processing');

    // Prefer opus/webm, fall back to whatever the browser chose
    const mimeType = chunks[0].type || 'audio/webm';
    const blob = new Blob(chunks, { type: mimeType });
    const form = new FormData();
    form.append('audio', blob, 'voice.webm');

    try {
      const res = await fetch('/api/asr/transcribe', { method: 'POST', body: form });
      if (res.ok) {
        const json = await res.json();
        const text: string = (json.text || '').trim();
        if (text) {
          onTranscribed(text, true); // auto-send in voice mode
        }
      }
    } catch {
      // Network / ASR failure — continue listening silently
    }

    if (activeRef.current) setVoiceState('listening');
  }, [onTranscribed]);

  /** Create a new MediaRecorder session for the next utterance. */
  const startRecording = useCallback(() => {
    if (!streamRef.current || !activeRef.current) return;
    chunksRef.current = [];

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    const recorder = new MediaRecorder(streamRef.current, { mimeType });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const toSend = [...chunksRef.current];
      chunksRef.current = [];

      if (speakingRef.current && toSend.length > 0) {
        // We had speech — transcribe it
        transcribeChunk(toSend);
      } else if (activeRef.current) {
        // Silent chunk — start fresh without transcribing
        setVoiceState('listening');
        startRecording();
      }
    };

    recorderRef.current = recorder;
    recorder.start(100); // chunk every 100 ms for low-latency VAD
  }, [transcribeChunk]);

  /**
   * Per-frame VAD loop using requestAnimationFrame.
   * Reads frequency-domain amplitude from the AnalyserNode and tracks
   * speech-onset / silence-onset transitions.
   */
  const analyzeAudio = useCallback(() => {
    if (!analyserRef.current || !freqBufRef.current || !activeRef.current) return;

    analyserRef.current.getByteFrequencyData(freqBufRef.current);
    const avg = freqBufRef.current.reduce((a, b) => a + b, 0) / freqBufRef.current.length;

    if (avg > silenceThreshold) {
      // ── Speech detected ──
      if (!speakingRef.current) {
        speakingRef.current = true;
        onSpeechStart?.();
        // Cancel any pending silence timer — the user is still talking
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
      }
    } else if (speakingRef.current && !silenceTimerRef.current) {
      // ── Silence after speech — start countdown ──
      silenceTimerRef.current = setTimeout(() => {
        silenceTimerRef.current = null;
        speakingRef.current = false;

        // Stop the current MediaRecorder; onstop will call transcribeChunk
        const rec = recorderRef.current;
        if (rec && rec.state === 'recording') {
          rec.stop();
        }

        // Start a fresh recording segment after a short gap
        if (activeRef.current) {
          setTimeout(() => { if (activeRef.current) startRecording(); }, 250);
        }
      }, silenceMs);
    }

    rafRef.current = requestAnimationFrame(analyzeAudio);
  }, [silenceThreshold, silenceMs, onSpeechStart, startRecording]);

  /** Request mic access and boot the full pipeline. */
  const start = useCallback(async () => {
    if (activeRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;

      // Build audio analysis graph: source → analyser (no output — we don't play it back)
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256; // 128 frequency bins — good balance of resolution vs. perf
      analyserRef.current = analyser;
      freqBufRef.current = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
      source.connect(analyser);

      activeRef.current = true;
      setVoiceActive(true);
      setVoiceState('listening');

      startRecording();
      rafRef.current = requestAnimationFrame(analyzeAudio);
    } catch {
      // Permission denied or hardware not available — stay in idle
      stopAll();
    }
  }, [startRecording, analyzeAudio, stopAll]);

  /** Toggle between active voice mode and idle. */
  const toggleVoiceMode = useCallback(() => {
    if (activeRef.current) stopAll();
    else start();
  }, [start, stopAll]);

  // Cleanup on component unmount
  useEffect(() => {
    return stopAll;
  }, [stopAll]);

  return {
    voiceActive,
    voiceState,
    startVoiceMode: start,
    stopVoiceMode: stopAll,
    toggleVoiceMode,
  };
}
