import { ArrowLeft, Eye } from 'lucide-react';
import type { Character } from '../lib/types';
import { useAppStore } from '../stores/appStore';

const IDLE_PHRASES = ['daydreaming...', 'humming a song~', 'reading something...', 'thinking about you...'];

/**
 * Chat header with character name, online indicator, idle status, and model panel toggle.
 * Sticky at the top of the ChatThread view.
 */
export function StatusBar({ character }: { character: Character }) {
  const { closeChatThread, toggleModelPanel, modelPanelOpen } = useAppStore();

  return (
    <header
      className="sticky top-0 z-40 flex items-center gap-3 px-4 h-12"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)'
      }}
    >
      <button onClick={closeChatThread} className="p-1" style={{ color: 'var(--color-text-secondary)' }}>
        <ArrowLeft size={20} />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm truncate">{character.name}</span>
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--color-success)' }} />
        </div>
        <p className="text-[10px] truncate" style={{ color: 'var(--color-text-secondary)' }}>
          {IDLE_PHRASES[Math.floor(Date.now() / 10000) % IDLE_PHRASES.length]}
        </p>
      </div>
      <button
        onClick={toggleModelPanel}
        className="p-1.5 rounded-lg transition-colors"
        style={{
          color: modelPanelOpen ? 'var(--color-accent)' : 'var(--color-text-secondary)',
          backgroundColor: modelPanelOpen ? 'var(--color-accent)' + '15' : 'transparent'
        }}
      >
        <Eye size={18} />
      </button>
    </header>
  );
}
