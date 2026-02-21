import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

import { microcopy } from '../lib/microcopy';
import type { VoiceLevelSample, VoiceSource } from '../types';

function avg(data: Uint8Array) {
  if (data.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < data.length; i += 1) {
    sum += data[i];
  }
  return sum / data.length;
}

function resolveVoiceSource(ttsLevel: number, micLevel: number): VoiceSource {
  const ttsActive = ttsLevel >= 0.05;
  const micActive = micLevel >= 0.05;

  if (ttsActive && micActive) return 'mixed';
  if (micActive) return 'mic';
  if (ttsActive) return 'tts';
  return 'idle';
}

function mapMicError(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') {
      return microcopy.errors.micDenied;
    }
    if (error.name === 'NotFoundError' || error.name === 'NotReadableError') {
      return microcopy.errors.micFailed;
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return microcopy.errors.micFailed;
}

export function useVoiceLevels(ttsAudioRef: RefObject<HTMLAudioElement | null>) {
  const [sample, setSample] = useState<VoiceLevelSample>({
    level: 0,
    source: 'idle',
    timestamp: 0
  });
  const [micEnabled, setMicEnabled] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  const contextRef = useRef<AudioContext | null>(null);
  const ttsAnalyserRef = useRef<AnalyserNode | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const ttsSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const smoothedLevelRef = useRef(0);

  useEffect(() => {
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    if (!contextRef.current) {
      contextRef.current = new AudioContextClass();
    }

    const context = contextRef.current;
    const ttsAudio = ttsAudioRef.current;

    if (!context || !ttsAudio || ttsSourceRef.current) {
      return;
    }

    try {
      const source = context.createMediaElementSource(ttsAudio);
      const analyser = context.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      analyser.connect(context.destination);
      ttsSourceRef.current = source;
      ttsAnalyserRef.current = analyser;

      const resume = () => {
        if (context.state === 'suspended') {
          void context.resume().catch(() => undefined);
        }
      };

      ttsAudio.addEventListener('play', resume);
      return () => ttsAudio.removeEventListener('play', resume);
    } catch {
      // Ignore duplicate source creation errors.
      return undefined;
    }
  }, [ttsAudioRef]);

  useEffect(() => {
    const context = contextRef.current;
    if (!context) return;

    if (!micEnabled) {
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((track) => track.stop());
        micStreamRef.current = null;
      }
      micAnalyserRef.current = null;
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      return;
    }

    let cancelled = false;

    const startMic = async () => {
      try {
        if (context.state === 'suspended') {
          await context.resume();
        }

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        micStreamRef.current = stream;
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 128;
        source.connect(analyser);
        micAnalyserRef.current = analyser;
        setMicError(null);
      } catch (error) {
        setMicError(mapMicError(error));
        setMicEnabled(false);
      }
    };

    void startMic();

    return () => {
      cancelled = true;
    };
  }, [micEnabled]);

  useEffect(() => {
    const ttsBuffer = new Uint8Array(64);
    const micBuffer = new Uint8Array(64);

    const tick = () => {
      const ttsAnalyser = ttsAnalyserRef.current;
      const micAnalyser = micAnalyserRef.current;

      let ttsLevel = 0;
      let micLevel = 0;

      if (ttsAnalyser) {
        ttsAnalyser.getByteFrequencyData(ttsBuffer);
        ttsLevel = avg(ttsBuffer) / 255;
      }

      if (micAnalyser) {
        micAnalyser.getByteFrequencyData(micBuffer);
        micLevel = avg(micBuffer) / 255;
      }

      const rawLevel = Math.max(ttsLevel, micLevel);
      const prevLevel = smoothedLevelRef.current;
      const smoothing = rawLevel > prevLevel ? 0.35 : 0.18;
      const smoothed = prevLevel + (rawLevel - prevLevel) * smoothing;
      const clampedLevel = Math.max(0, Math.min(1, smoothed));
      smoothedLevelRef.current = clampedLevel;

      const source = resolveVoiceSource(ttsLevel, micLevel);
      const now = Date.now();

      setSample((previous) => {
        if (
          Math.abs(previous.level - clampedLevel) < 0.01 &&
          previous.source === source &&
          now - previous.timestamp < 120
        ) {
          return previous;
        }
        return {
          level: clampedLevel,
          source,
          timestamp: now
        };
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      contextRef.current?.close();
    };
  }, []);

  return {
    level: sample.level,
    sample,
    micEnabled,
    micError,
    toggleMic: () => {
      if (!micEnabled && !navigator.mediaDevices?.getUserMedia) {
        setMicError(microcopy.errors.micUnavailable);
        return;
      }

      setMicError(null);
      setMicEnabled((value) => !value);
    }
  };
}
