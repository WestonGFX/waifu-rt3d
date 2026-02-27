import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import type { ScheduledNotification } from '../stores/appStore';

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

        // Skip if this notification is for the currently open character's chat
        // (the proactive message will appear in the chat bubble instead)
        if (activeCharacter?.id === msg.char_id) continue;

        const notification: ScheduledNotification = {
          id: `sched-${msg.id}-${Date.now()}`,
          charId: msg.char_id,
          charName: msg.char_name,
          charAvatarUrl: msg.char_avatar_url ?? undefined,
          preview: msg.text.length > 80 ? msg.text.slice(0, 80).trimEnd() + '…' : msg.text,
          receivedAt: Date.now(),
        };

        addScheduledNotification(notification);

        // Acknowledge delivery so the backend doesn't re-send on next poll
        fetch('/api/scheduler/acknowledge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message_id: msg.id }),
        }).catch(() => {}); // fire-and-forget, non-critical
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
