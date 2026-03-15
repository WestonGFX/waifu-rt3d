import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, MessageSquare, Loader2 } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { useChatStore } from '../stores/chatStore';

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

interface SearchResult {
  /** Message database ID. */
  id: number;
  /** The message text, possibly with <mark> tags inserted by the backend. */
  snippet: string;
  /** ISO timestamp of the message. */
  created_at: string;
  /** Conversation session ID the message belongs to. */
  session_id: number;
  /** Display name of the character linked to this session. */
  char_name: string;
  /** Character database ID. */
  char_id: number;
  /** Role of the message author — "user" or "assistant". */
  role: string;
}

interface SearchResponse {
  ok: boolean;
  results: SearchResult[];
  query: string;
  total: number;
}

/** Results keyed by character name, preserving insertion order. */
type GroupedResults = Map<string, SearchResult[]>;

/* ═══════════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Group a flat result list by `char_name`, preserving the order in which
 * character names first appear.
 *
 * @param results - Flat array of search results from the API.
 * @returns Map of char_name → SearchResult[].
 */
function groupByCharacter(results: SearchResult[]): GroupedResults {
  const map: GroupedResults = new Map();
  for (const r of results) {
    const key = r.char_name ?? 'Unknown Character';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return map;
}

/**
 * Render a message snippet, preserving `<mark>` tags from the server as
 * highlighted spans styled with the accent color.
 *
 * The backend wraps matched substrings in `<mark>…</mark>`; we parse those
 * out and convert them to React elements rather than using dangerouslySetInnerHTML.
 *
 * @param snippet - Raw snippet string, may contain `<mark>…</mark>` tags.
 * @returns Array of React nodes for inline rendering.
 */
function renderSnippet(snippet: string): React.ReactNode[] {
  // Split on <mark> and </mark> while keeping the delimiters in the array.
  const parts = snippet.split(/(<mark>|<\/mark>)/);
  const nodes: React.ReactNode[] = [];
  let inMark = false;
  let key = 0;
  for (const part of parts) {
    if (part === '<mark>') {
      inMark = true;
    } else if (part === '</mark>') {
      inMark = false;
    } else if (part) {
      if (inMark) {
        nodes.push(
          <mark
            key={key++}
            style={{
              backgroundColor: 'color-mix(in srgb, var(--color-accent) 22%, transparent)',
              color: 'var(--color-accent)',
              borderRadius: '2px',
              fontStyle: 'normal',
            }}
          >
            {part}
          </mark>
        );
      } else {
        nodes.push(<span key={key++}>{part}</span>);
      }
    }
  }
  return nodes;
}

/**
 * Format an ISO timestamp into a short relative or calendar string.
 *
 * @param iso - ISO 8601 date-time string.
 * @returns Human-readable label such as "2h ago" or "Jan 15".
 */
function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso);
    const now = Date.now();
    const diffMs = now - date.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Single search result row showing snippet, timestamp, and a "Jump to" button.
 *
 * Clicking "Jump to" navigates to the result's session by:
 * 1. Switching to the matching character in the sidebar
 * 2. Loading the session's message history into the chat thread
 * 3. Closing the search panel
 *
 * @param props.result - The search result to display.
 * @param props.onJump - Callback invoked after navigation completes.
 */
function ResultRow({ result, onJump }: { result: SearchResult; onJump: () => void }) {
  const handleJump = () => {
    const { characters, selectCharacter } = useAppStore.getState();
    const { setContext, loadHistory } = useChatStore.getState();

    // Find the character that owns this session
    const char = characters.find(c => c.id === result.char_id);
    if (char) {
      selectCharacter(char);
    }

    // Load the session into the chat thread
    setContext(result.session_id, result.char_id);
    loadHistory(result.session_id);

    // Close the search panel
    onJump();
  };

  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: '8px',
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}
    >
      {/* Snippet */}
      <p
        style={{
          margin: 0,
          fontSize: '0.82rem',
          lineHeight: 1.55,
          color: 'var(--color-text-secondary)',
          wordBreak: 'break-word',
          fontStyle: result.role === 'assistant' ? 'italic' : 'normal',
        }}
      >
        {renderSnippet(result.snippet)}
      </p>

      {/* Footer row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span
          style={{
            fontSize: '0.62rem',
            color: 'var(--color-text-tertiary)',
            letterSpacing: '0.03em',
          }}
        >
          {formatTimestamp(result.created_at)}
        </span>
        <span
          style={{
            fontSize: '0.62rem',
            color: result.role === 'assistant'
              ? 'var(--color-accent-soft)'
              : 'var(--color-text-tertiary)',
            textTransform: 'capitalize',
          }}
        >
          {result.role}
        </span>
        <button
          onClick={handleJump}
          style={{
            marginLeft: 'auto',
            padding: '2px 8px',
            fontSize: '0.65rem',
            borderRadius: '4px',
            border: '1px solid var(--color-border)',
            background: 'transparent',
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
          aria-label={`Jump to message in session ${result.session_id}`}
        >
          Jump to
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Main Panel
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Full-text search panel that slides in from the right.
 *
 * Features:
 * - Autofocused search input with 300ms debounce
 * - Results grouped by character name
 * - Optional character filter dropdown
 * - Inline <mark> highlight rendering
 * - Empty / loading / no-results states
 *
 * Fetches from GET /api/search/messages?q={query}&limit=30
 * (and optionally &char_id={id} when a filter is active).
 */
export function GlobalSearchPanel() {
  const { activeOverlay, closeOverlay, characters } = useAppStore();
  const open = activeOverlay === 'search';

  const [query, setQuery] = useState('');
  const [charFilter, setCharFilter] = useState<number | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Autofocus the input after the panel slides in.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 320);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Reset state when panel closes.
  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setError(null);
      setSearched(false);
      setCharFilter(null);
    }
  }, [open]);

  /**
   * Execute a search request against the backend.
   * Called by the debounced handler whenever the query or filter changes.
   *
   * @param q - The current search query string.
   * @param charId - Optional character ID filter.
   */
  const doSearch = useCallback(async (q: string, charId: number | null) => {
    if (!q.trim()) {
      setResults([]);
      setSearched(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ q: q.trim(), limit: '30' });
      if (charId != null) params.set('char_id', String(charId));

      const res = await fetch(`/api/search/messages?${params}`);
      if (!res.ok) throw new Error(`Search failed: ${res.status}`);

      const data: SearchResponse = await res.json();
      setResults(data.results ?? []);
      setSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed. Please try again.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Debounced query change handler — fires the search 300ms after the user
   * stops typing to avoid hammering the backend on every keystroke.
   */
  const handleQueryChange = (value: string) => {
    setQuery(value);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doSearch(value, charFilter);
    }, 300);
  };

  /** Re-run the search immediately when the character filter changes. */
  const handleCharFilterChange = (charId: number | null) => {
    setCharFilter(charId);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    doSearch(query, charId);
  };

  const grouped = groupByCharacter(results);
  const hasResults = results.length > 0;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="search-backdrop"
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
            key="search-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Search conversations"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            style={{
              position: 'fixed', top: 0, right: 0, bottom: 0,
              width: 'min(520px, 94vw)',
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
                padding: '16px 20px 14px',
                borderBottom: '1px solid var(--color-border)',
                flexShrink: 0,
              }}
            >
              {/* Title row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <MessageSquare size={16} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    letterSpacing: '0.06em',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  SEARCH CONVERSATIONS
                </span>
                <button
                  onClick={closeOverlay}
                  aria-label="Close search panel"
                  title="Close"
                  style={{
                    marginLeft: 'auto',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--color-text-secondary)',
                    padding: '4px',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Search input */}
              <div style={{ position: 'relative', marginBottom: '10px' }}>
                <Search
                  size={14}
                  style={{
                    position: 'absolute', left: '10px', top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--color-text-tertiary)',
                    pointerEvents: 'none',
                  }}
                />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={e => handleQueryChange(e.target.value)}
                  placeholder="Search all conversations…"
                  aria-label="Search query"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    paddingLeft: '32px',
                    paddingRight: query ? '32px' : '10px',
                    paddingTop: '7px',
                    paddingBottom: '7px',
                    fontSize: '0.85rem',
                    backgroundColor: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '7px',
                    color: 'var(--color-text-primary)',
                    outline: 'none',
                  }}
                />
                {query && (
                  <button
                    onClick={() => handleQueryChange('')}
                    aria-label="Clear search"
                    style={{
                      position: 'absolute', right: '8px', top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--color-text-tertiary)', padding: '2px',
                      display: 'flex', alignItems: 'center',
                    }}
                  >
                    <X size={11} />
                  </button>
                )}
              </div>

              {/* Character filter dropdown */}
              {characters.length > 1 && (
                <select
                  value={charFilter ?? ''}
                  onChange={e => handleCharFilterChange(e.target.value ? Number(e.target.value) : null)}
                  aria-label="Filter by character"
                  style={{
                    width: '100%',
                    padding: '5px 8px',
                    fontSize: '0.78rem',
                    backgroundColor: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '6px',
                    color: 'var(--color-text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  <option value="">All characters</option>
                  {characters.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* ── Results ── */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '16px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
              }}
            >
              {/* Loading spinner */}
              {loading && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
                  <Loader2
                    size={22}
                    style={{
                      color: 'var(--color-accent)',
                      animation: 'spin 0.8s linear infinite',
                    }}
                  />
                </div>
              )}

              {/* Error */}
              {error && !loading && (
                <p style={{
                  textAlign: 'center',
                  color: 'var(--color-danger, #f44)',
                  fontSize: '0.85rem',
                  padding: '24px 0',
                }}>
                  {error}
                </p>
              )}

              {/* Empty prompt — before any search */}
              {!loading && !error && !searched && (
                <div
                  style={{
                    flex: 1, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    gap: '10px', padding: '60px 20px', textAlign: 'center',
                  }}
                >
                  <Search size={32} style={{ opacity: 0.18, color: 'var(--color-text-secondary)' }} />
                  <p style={{ color: 'var(--color-text-tertiary)', fontSize: '0.85rem', margin: 0 }}>
                    Type to search all conversations…
                  </p>
                </div>
              )}

              {/* No results */}
              {!loading && !error && searched && !hasResults && (
                <div
                  style={{
                    flex: 1, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    gap: '10px', padding: '60px 20px', textAlign: 'center',
                  }}
                >
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.88rem', margin: 0 }}>
                    No messages found for "{query}"
                  </p>
                  <p style={{ color: 'var(--color-text-tertiary)', fontSize: '0.75rem', margin: 0 }}>
                    Try a shorter or different phrase.
                  </p>
                </div>
              )}

              {/* Grouped results */}
              {!loading && hasResults && (
                <>
                  {/* Result count summary */}
                  <p style={{
                    fontSize: '0.65rem',
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--color-text-tertiary)',
                    margin: 0,
                  }}>
                    {results.length} result{results.length !== 1 ? 's' : ''}
                  </p>

                  {Array.from(grouped.entries()).map(([charName, charResults]) => (
                    <section key={charName}>
                      {/* Character group header */}
                      <p
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          color: 'var(--color-accent)',
                          marginBottom: '8px',
                        }}
                      >
                        {charName}
                        <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400, marginLeft: 6 }}>
                          ({charResults.length})
                        </span>
                      </p>

                      {/* Result rows for this character */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {charResults.map(r => (
                          <ResultRow key={r.id} result={r} onJump={closeOverlay} />
                        ))}
                      </div>
                    </section>
                  ))}
                </>
              )}
            </div>
          </motion.div>

          {/* Spinner keyframe — injected once when panel mounts */}
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </>
      )}
    </AnimatePresence>
  );
}
