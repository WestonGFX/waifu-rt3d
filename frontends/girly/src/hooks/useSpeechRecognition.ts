/**
 * useSpeechRecognition – wraps WebSpeechSTTProvider into a React hook.
 *
 * Consumers get a simple { isRecording, isSupported, start, stop } interface.
 * The hook manages the provider lifecycle and wires the result callback back
 * to the caller via the `onTranscript` parameter.
 *
 * @param onTranscript - Called with the recognised text each time STT fires a result.
 * @returns Hook state and controls.
 *
 * @example
 *   const { isRecording, start, stop } = useSpeechRecognition((text) => {
 *     setInput(text);
 *   });
 */

import { useState, useRef, useCallback } from 'react';
import { getSTTProvider } from '../providers/registry.ts';

export default function useSpeechRecognition(onTranscript: (text: string) => void) {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep a stable reference to the callback so start() doesn't need to
  // re-create the provider instance when the parent re-renders.
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const provider = getSTTProvider('webSpeech');
  const isSupported = provider.isSupported();

  /**
   * Begin speech recognition.  No-op if not supported or already recording.
   */
  const start = useCallback(() => {
    if (!isSupported || isRecording) return;
    setError(null);
    setIsRecording(true);

    provider.start(
      { lang: 'en-US' },
      (transcript) => {
        onTranscriptRef.current(transcript);
        // Single-utterance mode: recognition ends automatically after one sentence.
        setIsRecording(false);
      },
      (err) => {
        // STT errored – stop recording state.  Error detail is logged by the provider.
        setError(err.message || 'Voice input failed. Please try again.');
        setIsRecording(false);
      },
    );
  }, [isSupported, isRecording, provider]);

  /**
   * Stop recognition manually (e.g. user taps mic again before auto-end).
   */
  const stop = useCallback(() => {
    provider.stop();
    setIsRecording(false);
  }, [provider]);

  return { isRecording, isSupported, error, start, stop };
}
