import { type ReactNode, useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import styles from './CommandPalette.module.css';

/* ==========================================================================
 * CommandPalette — ⌘K quick-action overlay
 * ==========================================================================
 * Glass overlay with fuzzy-filtered action list, keyboard navigation,
 * and spring entrance/exit animations.
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
 *     { id: 'settings', label: 'Settings', icon: <Cog size={16} />, onExecute: openSettings },
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
 * Command palette overlay with search filtering and keyboard navigation.
 *
 * Renders a full-viewport frosted glass backdrop with a centered panel
 * containing a search input and filterable action list. Supports arrow-key
 * navigation, Enter to execute, and Escape to dismiss.
 *
 * @param props - See {@link CommandPaletteProps}
 */
export function CommandPalette({ open, onClose, actions }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  /* Filter actions by case-insensitive substring match on label. */
  const filtered = actions.filter((a) =>
    a.label.toLowerCase().includes(query.toLowerCase()),
  );

  /* Reset state when palette opens/closes. */
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [open]);

  /* Auto-focus the search input when the palette opens. */
  useEffect(() => {
    if (open) {
      // Delay slightly so the element is mounted before focusing
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
   * Handle keyboard navigation within the palette.
   * Arrow keys move selection, Enter executes, Escape closes.
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex((prev) => (prev + 1) % Math.max(filtered.length, 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex((prev) =>
            prev <= 0 ? Math.max(filtered.length - 1, 0) : prev - 1,
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (filtered[activeIndex]) {
            executeAction(filtered[activeIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [filtered, activeIndex, executeAction, onClose],
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
              placeholder="Type a command..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              aria-label="Search commands"
              autoComplete="off"
              spellCheck={false}
            />

            {/* Action list */}
            <div className={styles.actionList} ref={listRef} role="listbox">
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
                    {/* Optional icon */}
                    {action.icon && (
                      <span className={styles.actionIcon}>{action.icon}</span>
                    )}

                    {/* Label + description */}
                    <div className={styles.actionText}>
                      <div className={styles.actionLabel}>{action.label}</div>
                      {action.description && (
                        <div className={styles.actionDescription}>
                          {action.description}
                        </div>
                      )}
                    </div>

                    {/* Shortcut badge */}
                    {action.shortcut && (
                      <span className={styles.shortcutBadge}>{action.shortcut}</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
