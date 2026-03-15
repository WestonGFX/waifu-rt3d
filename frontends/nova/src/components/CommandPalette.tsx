import { type ReactNode, useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import styles from './CommandPalette.module.css';
import { api } from '../lib/api';
import { useChatStore } from '../stores/chatStore';
import { useAppStore } from '../stores/appStore';

/* ==========================================================================
 * CommandPalette — Cmd+K quick-action overlay with full-text message search
 * ==========================================================================
 * Glass overlay with two modes:
 *
 * 1. **Command mode**: When the query is empty or matches known commands,
 *    shows a fuzzy-filtered list of actions with keyboard navigation.
 *
 * 2. **Search mode**: When the query doesn't match any command, fires a
 *    debounced search against `/api/search/messages` and displays results
 *    with highlighted snippets. Clicking a result loads that session.
 *
 * State is driven externally (novaStore.commandPaletteOpen) and passed
 * via `open` / `onClose` props.
 *
 * @example
 * ```tsx
 * <CommandPalette
 *   open={commandPaletteOpen}
 *   onClose={() => setCommandPaletteOpen(false)}
 *   actions={[
 *     { id: 'new-chat', label: 'New Chat', shortcut: '⌘N', onExecute: () => newChat() },
 *   ]}
 * />
 * ```
 * ========================================================================== */

/** A single executable action in the command palette. */
export interface CommandAction {
  /** Unique identifier for the action. */
  id: string;
  /** Display label shown in the action list. */
  label: string;
  /** Optional secondary description. */
  description?: string;
  /** Optional icon rendered before the label. */
  icon?: ReactNode;
  /** Optional keyboard shortcut displayed as a badge. */
  shortcut?: string;
  /** Callback invoked when the action is executed. */
  onExecute: () => void;
}

/** A search result from the `/api/search/messages` endpoint. */
interface SearchResult {
  /** Message database ID. */
  id: number;
  /** Conversation session ID the message belongs to. */
  session_id: number;
  /** Role of the message author — "user" or "assistant". */
  role: string;
  /** Snippet with `<mark>` highlights from the backend. */
  snippet: string;
  /** Timestamp string from the database. */
  created_at: string;
  /** Character database ID. */
  char_id: number;
  /** Display name of the character. */
  char_name: string;
}

/** Props for the CommandPalette component. */
interface CommandPaletteProps {
  /** Whether the palette is currently visible. */
  open: boolean;
  /** Called when the palette should close (Escape, backdrop click, or action execution). */
  onClose: () => void;
  /** Available actions to display and filter. */
  actions: CommandAction[];
}

/** Framer Motion spring config matching the Nova design system. */
const springConfig = { stiffness: 300, damping: 24 };

/**
 * Render a message snippet, converting `<mark>` tags from the server
 * into styled React elements instead of using dangerouslySetInnerHTML.
 *
 * @param snippet - Raw snippet string, may contain `<mark>…</mark>` tags.
 * @returns Array of React nodes for inline rendering.
 */
function renderSnippet(snippet: string): ReactNode[] {
  const parts = snippet.split(/(<mark>|<\/mark>)/);
  const nodes: ReactNode[] = [];
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
          <span
            key={key++}
            style={{
              backgroundColor: 'rgba(255, 141, 161, 0.2)',
              color: 'var(--nova-accent, #ff8da1)',
              borderRadius: '2px',
              padding: '0 1px',
            }}
          >
            {part}
          </span>
        );
      } else {
        nodes.push(<span key={key++}>{part}</span>);
      }
    }
  }
  return nodes;
}

/**
 * Format a timestamp string into a short relative label.
 *
 * @param ts - Timestamp string from the database.
 * @returns Human-readable label such as "2h ago" or "Jan 15".
 */
function formatTimestamp(ts: string): string {
  try {
    const date = new Date(ts);
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

/**
 * Command palette overlay with search filtering, keyboard navigation,
 * and full-text message search.
 *
 * When the query text matches command labels, shows filtered commands.
 * When no commands match and the query is 2+ chars, fires a debounced
 * search against the backend and shows message results with snippets.
 *
 * @param props - See {@link CommandPaletteProps}
 */
export function CommandPalette({ open, onClose, actions }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Search state
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Filter actions by case-insensitive substring match on label. */
  const filtered = actions.filter((a) =>
    a.label.toLowerCase().includes(query.toLowerCase()),
  );

  /* Determine the active mode: commands or search results. */
  const showSearch = query.length >= 2 && filtered.length === 0;
  const showCommands = !showSearch;

  /* Total items visible for keyboard navigation. */
  const totalItems = showSearch ? searchResults.length : filtered.length;

  /* Reset state when palette opens/closes. */
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setSearchResults([]);
      setSearchLoading(false);
    }
  }, [open]);

  /* Auto-focus the search input when the palette opens. */
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  /* Scroll the active item into view when navigating with arrow keys. */
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.children[activeIndex] as HTMLElement | undefined;
    activeEl?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  /**
   * Execute an action: call its handler and close the palette.
   */
  const executeAction = useCallback(
    (action: CommandAction) => {
      action.onExecute();
      onClose();
    },
    [onClose],
  );

  /**
   * Navigate to a search result's session. Switches to the matching
   * character and loads the session's message history.
   */
  const jumpToResult = useCallback(
    (result: SearchResult) => {
      const { characters } = useAppStore.getState();
      const char = characters.find(c => c.id === result.char_id);
      if (char) {
        useAppStore.getState().setActiveCharacter(char);
        useChatStore.getState().setActiveCharId(char.id);
      }
      useChatStore.getState().loadSession(result.session_id);
      onClose();
    },
    [onClose],
  );

  /**
   * Fire a debounced search when the query doesn't match any commands.
   */
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.length < 2 || filtered.length > 0) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    debounceRef.current = setTimeout(() => {
      api.searchMessages(query, 20)
        .then((data) => {
          setSearchResults(data.results ?? []);
          setSearchLoading(false);
        })
        .catch(() => {
          setSearchResults([]);
          setSearchLoading(false);
        });
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  /**
   * Handle keyboard navigation within the palette.
   * Arrow keys move selection, Enter executes, Escape closes.
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex((prev) => (prev + 1) % Math.max(totalItems, 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex((prev) =>
            prev <= 0 ? Math.max(totalItems - 1, 0) : prev - 1,
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (showCommands && filtered[activeIndex]) {
            executeAction(filtered[activeIndex]);
          } else if (showSearch && searchResults[activeIndex]) {
            jumpToResult(searchResults[activeIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [filtered, searchResults, activeIndex, executeAction, jumpToResult, onClose, showCommands, showSearch, totalItems],
  );

  /* Reset active index when filter results change. */
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={styles.backdrop}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
          onKeyDown={handleKeyDown}
        >
          <motion.div
            className={styles.panel}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', ...springConfig }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Command palette"
          >
            {/* Search input */}
            <input
              ref={inputRef}
              className={styles.searchInput}
              type="text"
              placeholder="Type a command or search messages..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              aria-label="Search commands and messages"
              autoComplete="off"
              spellCheck={false}
            />

            {/* Action / search result list */}
            <div className={styles.actionList} ref={listRef} role="listbox">
              {/* Command mode */}
              {showCommands && (
                <>
                  {filtered.length === 0 ? (
                    <div className={styles.emptyState}>No matching commands</div>
                  ) : (
                    filtered.map((action, i) => (
                      <div
                        key={action.id}
                        className={clsx(
                          styles.actionItem,
                          i === activeIndex && styles.actionItemActive,
                        )}
                        role="option"
                        aria-selected={i === activeIndex}
                        onClick={() => executeAction(action)}
                        onMouseEnter={() => setActiveIndex(i)}
                      >
                        {action.icon && (
                          <span className={styles.actionIcon}>{action.icon}</span>
                        )}
                        <div className={styles.actionText}>
                          <div className={styles.actionLabel}>{action.label}</div>
                          {action.description && (
                            <div className={styles.actionDescription}>
                              {action.description}
                            </div>
                          )}
                        </div>
                        {action.shortcut && (
                          <span className={styles.shortcutBadge}>{action.shortcut}</span>
                        )}
                      </div>
                    ))
                  )}
                </>
              )}

              {/* Search mode */}
              {showSearch && (
                <>
                  {/* Section label */}
                  <div className={styles.emptyState} style={{ padding: '8px 20px', textAlign: 'left', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
                    {searchLoading ? 'Searching messages...' : `${searchResults.length} message${searchResults.length !== 1 ? 's' : ''} found`}
                  </div>

                  {searchResults.map((result, i) => (
                    <div
                      key={`search-${result.id}`}
                      className={clsx(
                        styles.actionItem,
                        i === activeIndex && styles.actionItemActive,
                      )}
                      role="option"
                      aria-selected={i === activeIndex}
                      onClick={() => jumpToResult(result)}
                      onMouseEnter={() => setActiveIndex(i)}
                      style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}
                    >
                      {/* Character name + timestamp */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                        <span style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: 'var(--nova-accent, #ff8da1)',
                          letterSpacing: '0.03em',
                        }}>
                          {result.char_name}
                        </span>
                        <span style={{
                          fontSize: 10,
                          color: 'var(--nova-text-muted)',
                          marginLeft: 'auto',
                          flexShrink: 0,
                        }}>
                          {formatTimestamp(result.created_at)}
                        </span>
                      </div>

                      {/* Snippet */}
                      <div style={{
                        fontSize: 13,
                        lineHeight: 1.5,
                        color: 'var(--nova-text-secondary)',
                        wordBreak: 'break-word',
                        fontStyle: result.role === 'assistant' ? 'italic' : 'normal',
                      }}>
                        {renderSnippet(result.snippet)}
                      </div>

                      {/* Role badge */}
                      <span style={{
                        fontSize: 9,
                        color: result.role === 'assistant' ? 'var(--nova-accent, #ff8da1)' : 'var(--nova-text-muted)',
                        textTransform: 'capitalize',
                        letterSpacing: '0.04em',
                      }}>
                        {result.role}
                      </span>
                    </div>
                  ))}

                  {!searchLoading && searchResults.length === 0 && (
                    <div className={styles.emptyState}>No messages match "{query}"</div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
