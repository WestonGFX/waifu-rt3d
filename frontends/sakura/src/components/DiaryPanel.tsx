import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, BookOpen, Search } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { api } from '../lib/api';

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

interface DiaryEntry {
  text: string;
  /** ISO date string "YYYY-MM-DD" or null. */
  date: string | null;
}

/* ═══════════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Format an ISO date string (YYYY-MM-DD) into a readable label.
 *
 * @param iso - ISO date string or null.
 * @returns Formatted date like "Jan 15, 2025", or empty string for null.
 */
function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

/**
 * Highlight occurrences of a search query within a text string.
 * Returns an array of React spans — highlighted matches use the accent color.
 *
 * @param text - Full diary text.
 * @param query - User search query (case-insensitive).
 * @returns Array of JSX spans ready to render.
 */
function highlightText(text: string, query: string): React.ReactNode[] {
  if (!query.trim()) return [<span key="all">{text}</span>];
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 20%, transparent)', color: 'var(--color-accent)', borderRadius: 2 }}>{part}</mark>
      : <span key={i}>{part}</span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Main Panel
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Right slide-out panel that displays a character's diary entry (or entries
 * if more are added in the future).
 *
 * Features:
 * - Animated slide-in from the right (matches VocabPanel / MemoryPanel style)
 * - Backdrop click to close
 * - Inline search box to filter/highlight text in the diary
 * - Export button to download the diary as a .txt file
 * - Empty state with a helpful hint message
 *
 * The panel reads the active character from appStore and fetches from
 * GET /api/characters/{id}/diary on open.
 */
export function DiaryPanel() {
  const { activeOverlay, closeOverlay, activeCharacter } = useAppStore();
  const open = activeOverlay === 'diary';

  const [entry, setEntry] = useState<DiaryEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Fetch diary whenever the panel opens or the active character changes
  useEffect(() => {
    if (!open || !activeCharacter?.id) return;

    setLoading(true);
    setError(null);
    setEntry(null);
    setSearch('');

    api.getDiary(activeCharacter.id)
      .then(({ diary, diary_date }) => {
        if (diary) {
          setEntry({ text: diary, date: diary_date });
        } else {
          setEntry(null);
        }
      })
      .catch(() => {
        setError('Failed to load diary entry.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [open, activeCharacter?.id]);

  // Focus search input after panel animation completes
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => searchInputRef.current?.focus(), 320);
      return () => clearTimeout(timer);
    }
  }, [open]);

  /**
   * Download the diary entry as a plain text file.
   * Filename encodes the character name and diary date for easy identification.
   */
  const handleExport = () => {
    if (!entry) return;
    const charName = (activeCharacter?.name ?? 'character').replace(/[^a-z0-9]/gi, '_');
    const datePart = entry.date ?? 'undated';
    const header = [
      `Diary — ${activeCharacter?.name ?? 'Character'}`,
      entry.date ? `Written: ${formatDate(entry.date)}` : '',
      '',
      '',
    ].filter(Boolean).join('\n');

    const content = header + entry.text;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${charName}_diary_${datePart}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /** True when the current search query matches somewhere in the diary text. */
  const searchHits = search.trim() && entry
    ? entry.text.toLowerCase().includes(search.toLowerCase())
    : true;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="diary-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={closeOverlay}
            style={{
              position: 'fixed', inset: 0,
              backgroundColor: 'rgba(0,0,0,0.45)',
              zIndex: 40,
            }}
          />

          {/* Panel */}
          <motion.div
            key="diary-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Character diary"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            style={{
              position: 'fixed', top: 0, right: 0, bottom: 0,
              width: 'min(480px, 94vw)',
              backgroundColor: 'var(--color-background)',
              borderLeft: '1px solid var(--color-border)',
              boxShadow: '-8px 0 32px rgba(0,0,0,0.3)',
              zIndex: 50,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* ── Header ── */}
            <div
              style={{
                padding: '16px 20px 12px',
                borderBottom: '1px solid var(--color-border)',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <BookOpen size={16} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    letterSpacing: '0.06em',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  DIARY
                </span>
                {activeCharacter && (
                  <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginLeft: 2 }}>
                    {activeCharacter.name}
                  </span>
                )}
                {/* Export button — only visible when there is an entry */}
                {entry && (
                  <button
                    onClick={handleExport}
                    title="Download diary as .txt"
                    style={{
                      marginLeft: 'auto',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 8px',
                      fontSize: '0.72rem',
                      borderRadius: '5px',
                      border: '1px solid var(--color-border)',
                      background: 'transparent',
                      color: 'var(--color-text-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    <Download size={11} /> Export
                  </button>
                )}
                <button
                  onClick={closeOverlay}
                  style={{
                    marginLeft: entry ? '6px' : 'auto',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--color-text-muted)',
                    padding: '4px',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title="Close"
                  aria-label="Close diary panel"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Search box — only shown when there is content to search */}
              {entry && (
                <div style={{ position: 'relative', marginTop: '10px' }}>
                  <Search
                    size={13}
                    style={{
                      position: 'absolute', left: '8px', top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--color-text-muted)',
                      pointerEvents: 'none',
                    }}
                  />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search diary…"
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      paddingLeft: '28px',
                      paddingRight: '8px',
                      paddingTop: '5px',
                      paddingBottom: '5px',
                      fontSize: '0.78rem',
                      backgroundColor: 'var(--color-surface)',
                      border: search && !searchHits
                        ? '1px solid var(--color-danger, #f44)'
                        : '1px solid var(--color-border)',
                      borderRadius: '6px',
                      color: 'var(--color-text-primary)',
                    }}
                  />
                  {search && (
                    <button
                      onClick={() => setSearch('')}
                      style={{
                        position: 'absolute', right: '6px', top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--color-text-muted)', padding: '2px',
                        display: 'flex', alignItems: 'center',
                      }}
                      aria-label="Clear search"
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* ── Content ── */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {loading && (
                <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem', padding: '40px 0' }}>
                  Loading…
                </p>
              )}

              {error && !loading && (
                <p style={{ textAlign: 'center', color: 'var(--color-danger, #f44)', fontSize: '0.85rem', padding: '40px 0' }}>
                  {error}
                </p>
              )}

              {!loading && !error && !entry && (
                /* Empty state */
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px',
                    padding: '40px 20px',
                    textAlign: 'center',
                  }}
                >
                  <span style={{ fontSize: '2.5rem', lineHeight: 1, opacity: 0.4 }}>📔</span>
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '0.88rem', fontWeight: 500, margin: 0 }}>
                    No diary entries yet
                  </p>
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', maxWidth: '280px', lineHeight: 1.5, opacity: 0.75, margin: 0 }}>
                    {activeCharacter?.name ?? 'Your character'} will write a diary entry after your conversations. Start chatting to unlock this feature.
                  </p>
                </div>
              )}

              {!loading && !error && entry && (
                <article>
                  {/* Date stamp */}
                  {entry.date && (
                    <p
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        letterSpacing: '0.08em',
                        color: 'var(--color-accent)',
                        marginBottom: '16px',
                        textTransform: 'uppercase',
                      }}
                    >
                      {formatDate(entry.date)}
                    </p>
                  )}

                  {/* Decorative rule */}
                  <div
                    style={{
                      height: '1px',
                      marginBottom: '20px',
                      background: 'linear-gradient(to right, var(--color-accent), transparent)',
                      opacity: 0.35,
                    }}
                  />

                  {/* Diary body */}
                  <p
                    style={{
                      fontSize: '0.88rem',
                      lineHeight: 1.75,
                      color: 'var(--color-text-secondary)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      fontStyle: 'italic',
                      margin: 0,
                    }}
                  >
                    {/* Render with search highlighting when a query is active */}
                    {search.trim()
                      ? highlightText(entry.text, search)
                      : entry.text
                    }
                  </p>

                  {/* No-match notice */}
                  {search.trim() && !searchHits && (
                    <p
                      style={{
                        marginTop: '16px',
                        fontSize: '0.78rem',
                        color: 'var(--color-text-muted)',
                        fontStyle: 'normal',
                      }}
                    >
                      No matches for "{search}"
                    </p>
                  )}

                  {/* Footer note */}
                  <div
                    style={{
                      marginTop: '28px',
                      paddingTop: '16px',
                      borderTop: '1px solid var(--color-border-subtle)',
                      fontSize: '0.7rem',
                      color: 'var(--color-text-muted)',
                      opacity: 0.6,
                    }}
                  >
                    Written by {activeCharacter?.name ?? 'character'} after a chat session.
                  </div>
                </article>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
