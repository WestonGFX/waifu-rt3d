import { useEffect, useRef } from 'react';

interface ProactiveOptions {
  /** Whether proactive messaging is enabled. */
  enabled: boolean;
  /** Minutes of inactivity before triggering. */
  idleMinutes: number;
  /** Callback fired when the idle threshold is reached. */
  onTrigger: () => void;
}

/**
 * Hook that fires a callback after the user has been idle for a configurable duration.
 * Used for proactive "check-in" messages from the character.
 *
 * Listens for mousedown, keydown, scroll, and touchstart events to detect activity.
 * The timer resets on each interaction. When the idle threshold is reached, onTrigger
 * is called once; the timer then restarts waiting for activity again.
 *
 * @param options - Configuration for proactive messaging
 *
 * @example
 * useProactive({
 *   enabled: true,
 *   idleMinutes: 5,
 *   onTrigger: () => sendMessage('Hey, are you still there?')
 * });
 */
export function useProactive({ enabled, idleMinutes, onTrigger }: ProactiveOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(onTrigger, idleMinutes * 60 * 1000);
    };

    // Reset on user activity
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(e => window.addEventListener(e, resetTimer));
    resetTimer();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach(e => window.removeEventListener(e, resetTimer));
    };
  }, [enabled, idleMinutes, onTrigger]);
}
