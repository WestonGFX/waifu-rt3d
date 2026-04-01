/**
 * SceneBookmarks — Feature F20: Scene Bookmarks
 *
 * Overlay panel for viewing, browsing, and managing bookmarked messages.
 * Users can star memorable messages during chat; this panel shows all
 * bookmarked moments with content previews, labels, and navigation.
 *
 * API surface:
 *   GET    /api/bookmarks?character_id={id}&limit=50 — list bookmarks
 *   POST   /api/bookmarks                           — create bookmark
 *   DELETE /api/bookmarks/{id}                       — remove bookmark
 *   GET    /api/bookmarks/message/{msg_id}           — check if bookmarked
 *
 * @module SceneBookmarks
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Bookmark, Trash2, Loader2, MessageSquare, Star, Search,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

/** A single bookmark entry returned by the backend. */
interface BookmarkEntry {
  id: number;
  message_id: number;
  session_id: number;
  character_id: number | null;
  character_name: string | null;
  label: string | null;
  content_preview: string | null;
  role: string | null;
  created_at: string;
}

interface SceneBookmarksProps {
  /** Whether the panel is visible. */
  isOpen: boolean;
  /** Callback to close the panel. */
  onClose: () => void;
  /** Optional character ID to filter bookmarks. */
  characterId?: number;
  /** Optional character name for display. */
  characterName?: string;
  /** Callback when user clicks a bookmark to navigate to it. */
  onNavigate?: (sessionId: number, messageId: number) => void;
}

/* ═══════════════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Slide-in panel displaying all bookmarked messages for a character or globally.
 * Supports search filtering, deletion, and navigation to the original message.
 *
 * @param props - See {@link SceneBookmarksProps}.
 *
 * @example
 * <SceneBookmarks
 *   isOpen={showBookmarks}
 *   onClose={() => setShowBookmarks(false)}
 *   characterId={activeChar.id}
 *   characterName={activeChar.name}
 * />
 */
export function SceneBookmarks({
  isOpen,
  onClose,
  characterId,
  characterName,
  onNavigate,
}: SceneBookmarksProps) {
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);

  /* ── Fetch bookmarks on open ─────────────────────────────────────── */

  const fetchBookmarks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (characterId) params.set('character_id', String(characterId));
      const res = await fetch(`/api/bookmarks?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setBookmarks(data.bookmarks ?? []);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [characterId]);

  useEffect(() => {
    if (isOpen) fetchBookmarks();
  }, [isOpen, fetchBookmarks]);

  /* ── Delete a bookmark ───────────────────────────────────────────── */

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/bookmarks/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setBookmarks(prev => prev.filter(b => b.id !== id));
      }
    } catch {
      // Non-fatal — bookmark stays in list
    } finally {
      setDeletingId(null);
    }
  };

  /* ── Filtered bookmarks ──────────────────────────────────────────── */

  const filtered = search.trim()
    ? bookmarks.filter(b =>
        (b.content_preview ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (b.label ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (b.character_name ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : bookmarks;

  /* ── Format date for display ─────────────────────────────────────── */

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  /* ── Render ──────────────────────────────────────────────────────── */

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-[200]"
            style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Panel — right-slide drawer */}
          <motion.div
            className="fixed inset-y-4 right-4 z-[201] flex flex-col overflow-hidden"
            style={{
              width: 420,
              backgroundColor: 'var(--color-surface)',
              borderRadius: 'var(--radius-card)',
              boxShadow: 'var(--shadow-elevated)',
              border: '1px solid var(--color-border-subtle)',
            }}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
          >
            {/* ── Header ──────────────────────────────────────────── */}
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
            >
              <div className="flex items-center gap-2">
                <Bookmark size={16} style={{ color: 'var(--color-accent)' }} />
                <h2
                  className="text-sm font-semibold"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  {characterName ? `${characterName}'s Bookmarks` : 'Scene Bookmarks'}
                </h2>
                <span
                  className="text-xs px-1.5 py-0.5 rounded-full"
                  style={{
                    backgroundColor: 'var(--color-accent-soft)',
                    color: 'var(--color-accent)',
                    fontSize: '0.65rem',
                  }}
                >
                  {filtered.length}
                </span>
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-md hover:opacity-80 transition-opacity"
                style={{ color: 'var(--color-text-secondary)' }}
                aria-label="Close bookmarks"
              >
                <X size={16} />
              </button>
            </div>

            {/* ── Search bar ──────────────────────────────────────── */}
            <div className="px-4 py-2" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                style={{
                  backgroundColor: 'var(--color-background)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <Search size={13} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                <input
                  type="text"
                  placeholder="Search bookmarks..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="flex-1 text-xs bg-transparent outline-none"
                  style={{ color: 'var(--color-text-primary)' }}
                />
              </div>
            </div>

            {/* ── Bookmark list ────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto px-4 py-2">
              {loading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={20} className="animate-spin" style={{ color: 'var(--color-text-muted)' }} />
                </div>
              )}

              {error && (
                <div
                  className="text-xs text-center py-8"
                  style={{ color: 'var(--color-danger)' }}
                >
                  Failed to load bookmarks
                </div>
              )}

              {!loading && !error && filtered.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <Star size={28} style={{ color: 'var(--color-text-muted)', opacity: 0.4 }} />
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {search ? 'No bookmarks match your search' : 'No bookmarks yet'}
                  </p>
                  {!search && (
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)', opacity: 0.7 }}>
                      Star memorable moments during chat to save them here
                    </p>
                  )}
                </div>
              )}

              {!loading && filtered.map((bk) => (
                <motion.div
                  key={bk.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="mb-2 rounded-lg p-3"
                  style={{
                    backgroundColor: 'var(--color-surface-raised)',
                    border: '1px solid var(--color-border-subtle)',
                    cursor: onNavigate ? 'pointer' : 'default',
                  }}
                  onClick={() => onNavigate?.(bk.session_id, bk.message_id)}
                >
                  {/* Top row: label + date + delete */}
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <MessageSquare size={12} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
                      <span
                        className="text-xs font-medium truncate"
                        style={{ color: 'var(--color-text-primary)' }}
                      >
                        {bk.label || (bk.role === 'assistant' ? (bk.character_name ?? 'Character') : 'You')}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-xs" style={{ color: 'var(--color-text-muted)', fontSize: '0.6rem' }}>
                        {formatDate(bk.created_at)}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(bk.id); }}
                        className="p-0.5 rounded hover:opacity-80 transition-opacity"
                        style={{ color: 'var(--color-text-muted)' }}
                        aria-label="Remove bookmark"
                        disabled={deletingId === bk.id}
                      >
                        {deletingId === bk.id
                          ? <Loader2 size={11} className="animate-spin" />
                          : <Trash2 size={11} />}
                      </button>
                    </div>
                  </div>

                  {/* Content preview */}
                  {bk.content_preview && (
                    <p
                      className="text-xs leading-relaxed"
                      style={{
                        color: 'var(--color-text-secondary)',
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {bk.content_preview}
                    </p>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
