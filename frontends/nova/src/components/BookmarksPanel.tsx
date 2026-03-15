import { useState, useEffect, useCallback } from 'react';
import { Star, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useChatStore } from '../stores/chatStore';
import { useNovaStore } from '../stores/novaStore';
import styles from './BookmarksPanel.module.css';

/** Shape of a single bookmark returned by the API. */
interface Bookmark {
  id: number;
  message_id: number;
  session_id: number;
  character_id: number | null;
  character_name: string;
  label: string;
  content_preview: string;
  role: string;
  created_at: string;
}

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
 * Bookmarks panel for Nova's IconRail.
 *
 * Displays all bookmarked (starred) messages sorted by most recent,
 * allows jumping to the bookmarked session, and deleting bookmarks.
 * Rendered inside the IconRail's expandable panel (280px wide).
 *
 * @example
 * ```tsx
 * // In FocusedView's panelContent map:
 * const panelContent = {
 *   bookmarks: <BookmarksPanel />,
 * };
 * ```
 */
export function BookmarksPanel() {
  const loadSession = useChatStore((s) => s.loadSession);
  const addToast = useNovaStore((s) => s.addToast);

  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(false);

  /**
   * Fetch all bookmarks from the backend.
   * Called on mount and after any bookmark is deleted.
   */
  const fetchBookmarks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getBookmarks();
      setBookmarks(res.bookmarks);
    } catch (err) {
      console.error('[BookmarksPanel] Failed to fetch bookmarks:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchBookmarks();
  }, [fetchBookmarks]);

  /**
   * Navigate to the session containing the bookmarked message.
   *
   * @param sessionId - The session to load.
   */
  const handleJumpToSession = useCallback(async (sessionId: number) => {
    try {
      await loadSession(sessionId);
    } catch (err) {
      console.error('[BookmarksPanel] Failed to load session:', err);
      addToast('Failed to load session', 'error');
    }
  }, [loadSession, addToast]);

  /**
   * Delete a bookmark and refresh the list.
   *
   * @param e - Click event (stopped to prevent row click).
   * @param bookmarkId - The bookmark ID to delete.
   */
  const handleDelete = useCallback(async (
    e: React.MouseEvent,
    bookmarkId: number,
  ) => {
    e.stopPropagation();
    try {
      await api.deleteBookmark(bookmarkId);
      setBookmarks((prev) => prev.filter((b) => b.id !== bookmarkId));
      addToast('Bookmark removed', 'info');
    } catch (err) {
      console.error('[BookmarksPanel] Failed to delete bookmark:', err);
      addToast('Failed to remove bookmark', 'error');
    }
  }, [addToast]);

  return (
    <div className={styles.container}>
      {/* Bookmark list */}
      <div className={styles.bookmarkList}>
        {loading && bookmarks.length === 0 && (
          <p className={styles.emptyState}>Loading...</p>
        )}

        {!loading && bookmarks.length === 0 && (
          <div className={styles.emptyStateBlock}>
            <Star size={24} strokeWidth={1} className={styles.emptyIcon} />
            <p className={styles.emptyState}>
              No bookmarks yet. Star a message to save it here.
            </p>
          </div>
        )}

        {bookmarks.map((bookmark) => {
          const preview = bookmark.content_preview.length >= 100
            ? bookmark.content_preview.slice(0, 100) + '...'
            : bookmark.content_preview;
          const time = relativeTime(bookmark.created_at);

          return (
            <button
              key={bookmark.id}
              className={styles.bookmarkRow}
              onClick={() => handleJumpToSession(bookmark.session_id)}
              type="button"
            >
              {/* Header: character name + role badge */}
              <div className={styles.bookmarkHeader}>
                <span className={styles.characterName}>
                  {bookmark.character_name}
                </span>
                <span className={styles.roleBadge}>
                  {bookmark.role}
                </span>
              </div>

              {/* Message preview */}
              <div className={styles.bookmarkPreview}>
                {preview || '(empty message)'}
              </div>

              {/* Label (if present) */}
              {bookmark.label && (
                <span className={styles.bookmarkLabel}>
                  {bookmark.label}
                </span>
              )}

              {/* Timestamp + delete */}
              <div className={styles.bookmarkMeta}>
                <span className={styles.bookmarkTime}>{time}</span>
                <button
                  className={styles.deleteButton}
                  onClick={(e) => handleDelete(e, bookmark.id)}
                  title="Remove bookmark"
                  type="button"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
