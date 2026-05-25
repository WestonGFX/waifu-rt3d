import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import { useChatStore } from '../stores/chatStore';

/** How often (ms) to poll the backend for pending scheduled messages. */
const POLL_INTERVAL_MS = 30_000; // 30 seconds

interface PendingMessage {
  id: number;
  char_id: number;
  char_name: string;
  char_avatar_url: string | null;
  text: string;
  triggered_at: string;
}

interface PollResponse {
  ok: boolean;
  pending: PendingMessage[];
}

/**
 * Polls ``GET /api/scheduler/pending`` every 30 seconds and converts any
 * pending scheduled character messages into {@link ScheduledNotification}
 * entries in the global appStore.
 *
 * The backend marks messages as delivered once they have been acknowledged,
 * preventing duplicate notifications across page refreshes.
 *
 * Should be mounted once at the app root (e.g. in App.tsx) so polling
 * continues regardless of which view is active.
 *
 * @example
 * // In App.tsx:
 * useSchedulerPoller();
 */
export function useSchedulerPoller(): void {
  const { addScheduledNotification, activeCharacter } = useAppStore();
  // Track seen message IDs to avoid duplicate toasts within a session
  const seenIds = useRef<Set<number>>(new Set());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/scheduler/pending');
      if (!res.ok) return;

      const data: PollResponse = await res.json();
      if (!data.ok || !Array.isArray(data.pending)) return;

      for (const msg of data.pending) {
        if (seenIds.current.has(msg.id)) continue;
        seenIds.current.add(msg.id);

        // For active character: inject into chat thread + persist + acknowledge.
        if (activeCharacter?.id === msg.char_id) {
          const { injectProactiveMessage, sessionId } = useChatStore.getState();
          if (sessionId) {
            injectProactiveMessage({ text: msg.text, serverMessageId: msg.id });
            fetch(`/api/characters/${msg.char_id}/proactive/inject`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ session_id: sessionId }),
            }).catch(() => {});
          }
        } else {
          // Non-active character: persist the message into THAT character's
          // most-recent session so it's waiting in chat when the user opens
          // them. **No popup, no toast** — session-46 user directive: "ANY
          // 'while you were gone' content should be a normal chat message,
          // not a popup". The backend endpoint resolves the session itself.
          fetch(`/api/characters/${msg.char_id}/proactive/inject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          }).catch(() => {});
        }

        // Always acknowledge so the backend doesn't re-send on next poll.
        fetch('/api/scheduler/acknowledge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message_id: msg.id }),
        }).catch(() => {});
      }
    } catch {
      // Network error — silently skip this poll cycle
    }
  }, [addScheduledNotification, activeCharacter]);

  useEffect(() => {
    // Immediate first poll then start the interval
    poll();
    timerRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [poll]);
}
