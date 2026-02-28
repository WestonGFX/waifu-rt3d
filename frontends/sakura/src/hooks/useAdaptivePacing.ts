import { useEffect, useRef, useState } from 'react';
import type { ReplyLengthMode } from '../stores/appStore';

/**
 * Maps a ReplyLengthMode to a concrete max_tokens value.
 * The 'auto' entry is a placeholder replaced by adaptive logic in useAdaptivePacing.
 */
export const REPLY_LENGTH_TOKENS: Record<ReplyLengthMode, number> = {
  brief:    180,
  normal:   400,
  detailed: 900,
  auto:     400, // placeholder, replaced by adaptive logic below
};

/**
 * Tracks keystrokes-per-minute in the chat composer and suggests a
 * max_tokens value based on typing pace when replyLengthMode is 'auto'.
 *
 * Fast typists (>55 wpm) get brief replies.
 * Deliberate typists (<25 wpm) get detailed replies.
 * Mid-range typists get normal replies.
 *
 * @param replyLengthMode - Current setting from appStore.
 * @returns effectiveMaxTokens — the integer max_tokens to pass to sendMessage.
 *
 * @example
 * const effectiveMaxTokens = useAdaptivePacing('auto');
 * // Returns 180, 400, or 900 depending on detected typing speed.
 */
export function useAdaptivePacing(replyLengthMode: ReplyLengthMode): number {
  const [autoTokens, setAutoTokens] = useState(400);
  const keystrokesRef = useRef<number[]>([]); // timestamps of recent keystrokes

  useEffect(() => {
    if (replyLengthMode !== 'auto') return;

    /**
     * Record each keydown timestamp and compute WPM over the last 10 seconds.
     * Average word = 5 keystrokes; WPM = (keystrokes / 5) / (window_secs / 60).
     */
    const handleKey = () => {
      const now = Date.now();
      keystrokesRef.current = [
        ...keystrokesRef.current.filter(ts => now - ts < 10_000),
        now,
      ];
      const windowSecs = 10;
      const wpm = (keystrokesRef.current.length / 5) / (windowSecs / 60);
      if (wpm > 55) setAutoTokens(180);       // fast typist → brief
      else if (wpm < 25) setAutoTokens(900);  // deliberate → detailed
      else setAutoTokens(400);                // normal pace
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [replyLengthMode]);

  if (replyLengthMode === 'auto') return autoTokens;
  return REPLY_LENGTH_TOKENS[replyLengthMode];
}
