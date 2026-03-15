import { useState, useEffect, useCallback } from 'react';
import { Plus, MessageSquare } from 'lucide-react';
import { api } from '../lib/api';
import { useChatStore } from '../stores/chatStore';
import { useAppStore } from '../stores/appStore';
import type { Session } from '../lib/types';
import styles from './ChatHistoryPanel.module.css';

/**
 * Formats an ISO timestamp into a human-readable relative time string.
 *
 * Returns "just now" for < 1 min, "Xm ago" for < 1 hour, "Xh ago" for
 * < 24 hours, and a short date string (e.g. "Mar 14") for older dates.
 *
 * @param isoString - ISO 8601 date string from the backend.
 * @returns A compact relative time label.
 */
function relativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;

  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Chat history panel for Nova's IconRail.
 *
 * Displays all sessions for the active character sorted by most recent,
 * allows switching between sessions, and creating new ones. Rendered
 * inside the IconRail's expandable panel (280px wide).
 *
 * @example
 * ```tsx
 * // In FocusedView's panelContent map:
 * const panelContent = {
 *   'chat-history': <ChatHistoryPanel />,
 *   settings: <SettingsPanel />,
 * };
 * ```
 */
export function ChatHistoryPanel() {
  const activeCharacter = useAppStore((s) => s.activeCharacter);
  const sessionId = useChatStore((s) => s.sessionId);
  const loadSession = useChatStore((s) => s.loadSession);
  const createSession = useChatStore((s) => s.createSession);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  /**
   * Fetch all sessions from the backend and filter to the active character.
   * Sorts by most recently updated first.
   */
  const fetchSessions = useCallback(async () => {
    if (!activeCharacter) {
      setSessions([]);
      return;
    }

    setLoading(true);
    try {
      const all = await api.getSessions();
      const filtered = all
        .filter((s) => s.character_id === activeCharacter.id)
        .sort((a, b) => {
          const dateA = new Date(a.updated_at || a.created_at).getTime();
          const dateB = new Date(b.updated_at || b.created_at).getTime();
          return dateB - dateA;
        });
      setSessions(filtered);
    } catch (err) {
      console.error('[ChatHistoryPanel] Failed to fetch sessions:', err);
    } finally {
      setLoading(false);
    }
  }, [activeCharacter]);

  // Re-fetch whenever the active character changes
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  /**
   * Create a new session for the active character and refresh the list.
   */
  const handleNewChat = useCallback(async () => {
    if (!activeCharacter || creating) return;

    setCreating(true);
    try {
      await createSession(activeCharacter.id);
      await fetchSessions();
    } catch (err) {
      console.error('[ChatHistoryPanel] Failed to create session:', err);
    } finally {
      setCreating(false);
    }
  }, [activeCharacter, creating, createSession, fetchSessions]);

  /**
   * Switch to a different session by loading its messages into the chat store.
   *
   * @param id - The session ID to load.
   */
  const handleSelectSession = useCallback(async (id: number) => {
    if (id === sessionId) return;

    try {
      await loadSession(id);
    } catch (err) {
      console.error('[ChatHistoryPanel] Failed to load session:', err);
    }
  }, [sessionId, loadSession]);

  // No character selected
  if (!activeCharacter) {
    return (
      <div className={styles.container}>
        <p className={styles.emptyState}>Select a character to view history</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* New chat button */}
      <button
        className={styles.newChatButton}
        onClick={handleNewChat}
        disabled={creating}
        type="button"
      >
        <Plus size={14} strokeWidth={2} />
        {creating ? 'Creating...' : 'New Chat'}
      </button>

      {/* Session list */}
      <div className={styles.sessionList}>
        {loading && sessions.length === 0 && (
          <p className={styles.emptyState}>Loading...</p>
        )}

        {!loading && sessions.length === 0 && (
          <div className={styles.emptyStateBlock}>
            <MessageSquare size={24} strokeWidth={1} className={styles.emptyIcon} />
            <p className={styles.emptyState}>No conversations yet</p>
          </div>
        )}

        {sessions.map((session) => {
          const isActive = session.id === sessionId;
          const title = session.title?.trim() || 'Untitled';
          const time = relativeTime(session.updated_at || session.created_at);
          const count = session.message_count ?? 0;

          return (
            <button
              key={session.id}
              className={`${styles.sessionRow} ${isActive ? styles.sessionRowActive : ''}`}
              onClick={() => handleSelectSession(session.id)}
              type="button"
            >
              <div className={styles.sessionTitle}>{title}</div>
              <div className={styles.sessionMeta}>
                <span className={styles.sessionCount}>
                  {count} {count === 1 ? 'msg' : 'msgs'}
                </span>
                <span className={styles.sessionTime}>{time}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
