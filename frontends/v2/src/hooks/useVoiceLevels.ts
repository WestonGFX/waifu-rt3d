import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

function avg(data: Uint8Array) {
  if (data.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < data.length; i += 1) {
    sum += data[i];
  }
  return sum / data.length;
}

export function useVoiceLevels(ttsAudioRef: RefObject<HTMLAudioElement | null>) {
  const [level, setLevel] = useState(0);
  const [micEnabled, setMicEnabled] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  const contextRef = useRef<AudioContext | null>(null);
  const ttsAnalyserRef = useRef<AnalyserNode | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const ttsSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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
    } catch {
      // Ignore duplicate source creation errors.
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

    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
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
      })
      .catch((error: Error) => {
        setMicError(error.message || 'Microphone unavailable');
        setMicEnabled(false);
      });

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

      setLevel(Math.max(ttsLevel, micLevel));
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
    level,
    micEnabled,
    micError,
    toggleMic: () => {
      setMicError(null);
      setMicEnabled((value) => !value);
    }
  };
}
