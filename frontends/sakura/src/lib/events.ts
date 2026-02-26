type Handler = (...args: unknown[]) => void;

const listeners = new Map<string, Set<Handler>>();

/** Lightweight pub/sub event bus for cross-component communication. */
export const events = {
  /**
   * Subscribe to an event.
   *
   * @param event - Event name
   * @param handler - Callback function
   * @returns Unsubscribe function
   */
  on(event: string, handler: Handler) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(handler);
    return () => listeners.get(event)?.delete(handler);
  },

  /**
   * Emit an event to all subscribers.
   *
   * @param event - Event name
   * @param args - Arguments to pass to handlers
   */
  emit(event: string, ...args: unknown[]) {
    listeners.get(event)?.forEach(fn => fn(...args));
  },

  /**
   * Unsubscribe a specific handler from an event.
   *
   * @param event - Event name
   * @param handler - Handler to remove
   */
  off(event: string, handler: Handler) {
    listeners.get(event)?.delete(handler);
  }
};
