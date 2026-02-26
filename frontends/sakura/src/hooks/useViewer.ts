import { useCallback, useRef } from 'react';

/**
 * Hook providing a postMessage bridge to the 3D viewer iframe.
 * Exposes high-level commands (loadCharacter, setEmotion, etc.) that
 * translate to structured messages sent to the iframe's contentWindow.
 */
export function useViewer() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const post = useCallback((message: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(message, '*');
  }, []);

  const loadCharacter = useCallback((modelUrl: string) => {
    post({ type: 'loadCharacter', payload: { modelUrl } });
  }, [post]);

  const setEmotion = useCallback((emotion: string, intensity = 0.8, duration = 3000) => {
    post({ type: 'setEmotion', emotion, intensity, duration });
  }, [post]);

  const playGesture = useCallback((gesture: string) => {
    post({ type: 'playGesture', payload: { gesture } });
  }, [post]);

  const setCameraPreset = useCallback((preset: 'fullbody' | 'bust' | 'face') => {
    post({ type: 'setCameraPreset', payload: { preset } });
  }, [post]);

  const playAudio = useCallback((audioUrl: string) => {
    post({ type: 'playAudio', audioUrl });
  }, [post]);

  return { iframeRef, loadCharacter, setEmotion, playGesture, setCameraPreset, playAudio };
}
