import { useState, useEffect, useRef } from 'react';
import { Eye, MessageSquare, Search, Download, X } from 'lucide-react';
import type { Character } from '../lib/types';
import { useAppStore } from '../stores/appStore';

const IDLE_PHRASES = [
  'daydreaming...',
  'humming a song~',
  'reading something...',
  'thinking about you...',
  'gazing out the window...'
];

/**
 * Chat header with character name, online indicator, idle status, and model panel toggle.
 * Sticky at the top of the ChatThread view with frosted-glass backdrop.
 *
 * Cycles through ambient idle phrases every 10 seconds to give the character
 * a sense of life even when no messages are being exchanged.
 */
export function StatusBar({
  character,
  onOpenSessions,
  onSearchChange,
  onExport,
}: {
  character: Character;
  onOpenSessions?: () => void;
  onSearchChange?: (query: string) => void;
  onExport?: () => void;
}) {
  const { toggleModelPanel, modelPanelOpen } = useAppStore();
  const [idlePhrase, setIdlePhrase] = useState(IDLE_PHRASES[0]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setIdlePhrase(prev => {
        const idx = IDLE_PHRASES.indexOf(prev);
        return IDLE_PHRASES[(idx + 1) % IDLE_PHRASES.length];
      });
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const toggleSearch = () => {
    if (searchOpen) {
      setSearchOpen(false);
      setSearchQuery('');
      onSearchChange?.('');
    } else {
      setSearchOpen(true);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  };

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    onSearchChange?.(q);
  };

  const btnStyle = (active = false) => ({
    color: active ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
    backgroundColor: active ? 'var(--color-accent-soft)' : 'transparent',
    boxShadow: active ? 'var(--shadow-glow)' : 'none',
  });

  return (
    <header
      className="sticky top-0 z-40"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--color-surface) 85%, transparent)',
        backdropFilter: 'var(--blur-surface)',
        WebkitBackdropFilter: 'var(--blur-surface)',
        borderBottom: '1px solid var(--color-border-subtle)'
      }}
    >
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 h-14">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>
              {character.name}
            </span>
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{
                backgroundColor: 'var(--color-success)',
                boxShadow: '0 0 6px var(--color-success)'
              }}
            />
          </div>
          <p className="text-[10px] truncate" style={{ color: 'var(--color-text-tertiary)' }}>
            {idlePhrase}
          </p>
        </div>

        {onOpenSessions && (
          <button onClick={onOpenSessions} className="p-2 rounded-lg transition-all duration-200"
            style={btnStyle()} title="Chat threads">
            <MessageSquare size={18} />
          </button>
        )}
        <button onClick={toggleSearch} className="p-2 rounded-lg transition-all duration-200"
          style={btnStyle(searchOpen)} title="Search messages">
          <Search size={18} />
        </button>
        {onExport && (
          <button onClick={onExport} className="p-2 rounded-lg transition-all duration-200"
            style={btnStyle()} title="Export conversation">
            <Download size={18} />
          </button>
        )}
        <button onClick={toggleModelPanel} className="p-2 rounded-lg transition-all duration-200"
          style={btnStyle(modelPanelOpen)} title="Toggle 3D viewer">
          <Eye size={18} />
        </button>
      </div>

      {/* Search bar — slides down when open */}
      {searchOpen && (
        <div className="px-4 pb-2 flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg"
            style={{ backgroundColor: 'var(--color-background)', border: '1px solid var(--color-border)' }}>
            <Search size={13} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder="Search messages..."
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: 'var(--color-text-primary)' }}
            />
            {searchQuery && (
              <button onClick={() => handleSearchChange('')} style={{ color: 'var(--color-text-tertiary)' }}>
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
