/**
 * useDebounce – Generic debounce hook for AnimeGirly.
 *
 * Returns a debounced version of a callback that delays invocation until
 * `delayMs` milliseconds have elapsed since the last call.  The returned
 * function also exposes a `.cancel()` method.
 *
 * Primarily used to debounce window resize events in ThreeViewer and
 * SettingsContext to prevent excessive re-renders on drag-resize.
 *
 * Phase: Foundation fix (claude/improvements branch)
 */

import { useCallback, useRef, useEffect } from 'react';

/**
 * Returns a debounced version of `callback`.
 *
 * @param callback - The function to debounce.
 * @param delayMs  - Milliseconds to wait before invoking.
 * @returns A stable debounced function with a `.cancel()` method.
 */
export function useDebounce<T extends (...args: unknown[]) => void>(
  callback: T,
  delayMs: number,
): T & { cancel: () => void } {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);

  // Keep the ref in sync so the debounced closure always calls the latest callback.
  callbackRef.current = callback;

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Clean up on unmount.
  useEffect(() => cancel, [cancel]);

  const debounced = useCallback(
    (...args: Parameters<T>) => {
      cancel();
      timerRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delayMs);
    },
    [delayMs, cancel],
  ) as T & { cancel: () => void };

  debounced.cancel = cancel;
  return debounced;
}

/**
 * useDebouncedValue – Returns a debounced copy of a value.
 *
 * Useful for debouncing reactive state (e.g., a search input) without
 * wrapping the onChange handler manually.
 */
import { useState } from 'react';

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
