import { useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../stores/appStore';

interface CommandEntry {
  id: string;
  label: string;
  shortcut?: string;
  action: () => void;
  group: string;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Fuzzy-search command palette activated by Cmd+K.
 * Renders centred over all content (zIndex 300).
 * Keyboard: ArrowUp/Down navigate selection, Enter fires action, Esc closes.
 */
export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { openOverlay, characters, selectCharacter, toggleMinimalMode } = useAppStore();

  const commands = useMemo<CommandEntry[]>(() => [
    // Navigation
    { id: 'settings',       group: 'Navigation', label: 'Settings',             shortcut: 'Ctrl+,',     action: () => { openOverlay('settings'); onClose(); } },
    { id: 'memory',         group: 'Navigation', label: 'Memory Browser',        shortcut: 'Ctrl+M',     action: () => { openOverlay('memorybrowser'); onClose(); } },
    { id: 'search',         group: 'Navigation', label: 'Message Search',        shortcut: 'Alt+F',      action: () => { openOverlay('search'); onClose(); } },
    { id: 'gallery',        group: 'Navigation', label: 'Gallery',                               action: () => { openOverlay('gallery'); onClose(); } },
    { id: 'diary',          group: 'Navigation', label: 'Character Diary',       shortcut: 'Alt+D',      action: () => { openOverlay('diary'); onClose(); } },
    { id: 'stats',          group: 'Navigation', label: 'Character Stats',       shortcut: 'Alt+Z',      action: () => { openOverlay('stats'); onClose(); } },
    { id: 'timeline',       group: 'Navigation', label: 'Relationship Timeline', shortcut: 'Alt+T',      action: () => { openOverlay('timeline'); onClose(); } },
    { id: 'analytics',      group: 'Navigation', label: 'Conversation Analytics',shortcut: 'Alt+A',      action: () => { openOverlay('analytics'); onClose(); } },
    { id: 'summary',        group: 'Navigation', label: 'Session Summary',       shortcut: 'Alt+S',      action: () => { openOverlay('summary'); onClose(); } },
    { id: 'scenarios',      group: 'Navigation', label: 'Scenario Library',      shortcut: 'Alt+I',      action: () => { openOverlay('scenarios'); onClose(); } },
    // Bond Panel + Milestones entries removed session-47 (queue #10) — panels deleted.
    { id: 'bookmarks',      group: 'Navigation', label: 'Bookmarks',             shortcut: 'Alt+Shift+K',action: () => { openOverlay('bookmarks'); onClose(); } },
    { id: 'lore',           group: 'Navigation', label: 'Lorebook',                              action: () => { openOverlay('lore'); onClose(); } },
    { id: 'vocab',          group: 'Navigation', label: 'Vocabulary Manager',    shortcut: 'Alt+V',      action: () => { openOverlay('vocab'); onClose(); } },
    { id: 'boundaries',     group: 'Navigation', label: 'Boundaries',            shortcut: 'Alt+Shift+B',action: () => { openOverlay('boundaries'); onClose(); } },
    { id: 'desiretree',     group: 'Navigation', label: 'Desire Tree',           shortcut: 'Alt+Shift+D',action: () => { openOverlay('desiretree'); onClose(); } },
    { id: 'replay',         group: 'Navigation', label: 'Session Replay',        shortcut: 'Alt+R',      action: () => { openOverlay('replay'); onClose(); } },
    { id: 'modelbrowser',   group: 'Navigation', label: 'Model Browser',                         action: () => { openOverlay('modelbrowser'); onClose(); } },
    { id: 'about',          group: 'Navigation', label: 'About',                 shortcut: 'Alt+Shift+A',action: () => { openOverlay('about'); onClose(); } },
    // Mode toggles
    { id: 'minimal',        group: 'Mode',       label: 'Toggle Minimal Mode',   shortcut: 'Ctrl+Shift+M', action: () => { toggleMinimalMode(); onClose(); } },
    // Character switching
    ...characters.map(ch => ({
      id: `char-${ch.id}`,
      group: 'Character',
      label: `Switch to ${ch.name}`,
      action: () => { selectCharacter(ch); onClose(); },
    })),
  ], [openOverlay, characters, selectCharacter, toggleMinimalMode, onClose]);

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(cmd => cmd.label.toLowerCase().includes(q));
  }, [commands, query]);

  // Reset selection when filtered list changes
  useEffect(() => { setSelectedIdx(0); }, [filtered.length]);

  // Focus input on open, clear query on close
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Scroll selected item into view
  useEffect(() => {
    const row = listRef.current?.querySelector(`[data-idx="${selectedIdx}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      filtered[selectedIdx]?.action();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  // Group consecutive rows under headers
  const rows: Array<{ isHeader: boolean; label: string; cmd?: CommandEntry; idx?: number }> = [];
  let lastGroup = '';
  let cmdIdx = 0;
  for (const cmd of filtered) {
    if (cmd.group !== lastGroup) {
      rows.push({ isHeader: true, label: cmd.group });
      lastGroup = cmd.group;
    }
    rows.push({ isHeader: false, label: cmd.label, cmd, idx: cmdIdx++ });
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="palette-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            style={{
              position: 'fixed', inset: 0,
              backgroundColor: 'rgba(0,0,0,0.45)',
              backdropFilter: 'blur(3px)',
              zIndex: 299,
            }}
          />

          {/* Palette */}
          <motion.div
            key="palette-panel"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            onKeyDown={handleKeyDown}
            style={{
              position: 'fixed',
              top: '20vh',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '560px',
              maxWidth: 'calc(100vw - 32px)',
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: '12px',
              boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
              zIndex: 300,
              overflow: 'hidden',
            }}
          >
            {/* Search input */}
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--color-border-subtle)' }}>
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Type a command or search..."
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--color-text-primary)',
                  fontSize: '15px',
                }}
              />
            </div>

            {/* Results */}
            <div
              ref={listRef}
              style={{ maxHeight: '340px', overflowY: 'auto', padding: '6px 0' }}
            >
              {filtered.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                  No results for "{query}"
                </div>
              ) : (
                rows.map((row, i) =>
                  row.isHeader ? (
                    <div
                      key={`hdr-${row.label}-${i}`}
                      style={{
                        padding: '6px 14px 2px',
                        fontSize: '11px',
                        fontWeight: 600,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color: 'var(--color-text-tertiary)',
                      }}
                    >
                      {row.label}
                    </div>
                  ) : (
                    <button
                      key={row.cmd!.id}
                      data-idx={row.idx}
                      onClick={row.cmd!.action}
                      onMouseEnter={() => setSelectedIdx(row.idx!)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                        padding: '8px 14px',
                        background: row.idx === selectedIdx ? 'var(--color-accent-soft)' : 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--color-text-primary)',
                        fontSize: '13px',
                        textAlign: 'left',
                      }}
                    >
                      <span>{row.cmd!.label}</span>
                      {row.cmd!.shortcut && (
                        <kbd style={{
                          fontSize: '11px',
                          color: 'var(--color-text-tertiary)',
                          background: 'var(--color-background)',
                          border: '1px solid var(--color-border)',
                          borderRadius: '4px',
                          padding: '1px 5px',
                          fontFamily: 'monospace',
                        }}>
                          {row.cmd!.shortcut}
                        </kbd>
                      )}
                    </button>
                  )
                )
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
