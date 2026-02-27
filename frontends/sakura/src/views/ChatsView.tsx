import { useEffect, useState } from 'react';
import { MessageCircle, Database, Activity } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { CharacterCard } from '../components/CharacterCard';
import { api } from '../lib/api';

interface AppStats {
  total_messages?: number;
  total_sessions?: number;
  total_memories?: number;
  llm_provider?: string;
}

/**
 * Compact row of app telemetry stats: message count, sessions, memories.
 * Fetched once on mount from /api/stats.
 */
function StatsBar() {
  const [stats, setStats] = useState<AppStats | null>(null);

  useEffect(() => {
    api.getStats()
      .then(s => setStats(s as AppStats))
      .catch(() => {});
  }, []);

  const items: Array<{ icon: React.ReactNode; label: string; value: number | string }> = [
    { icon: <MessageCircle size={11} />, label: 'Messages', value: stats?.total_messages ?? '—' },
    { icon: <Activity size={11} />, label: 'Sessions', value: stats?.total_sessions ?? '—' },
    { icon: <Database size={11} />, label: 'Memories', value: stats?.total_memories ?? '—' },
  ];

  return (
    <div
      className="flex items-center gap-4 px-4 py-2.5 rounded-xl mb-4"
      style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border-subtle)',
      }}
    >
      {items.map(item => (
        <div key={item.label} className="flex items-center gap-1.5">
          <span style={{ color: 'var(--color-text-tertiary)' }}>{item.icon}</span>
          <span className="text-xs tabular-nums font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {item.value}
          </span>
          <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Format a Unix timestamp as a relative time string (e.g. "2h ago", "3d ago"). */
function relativeTime(ts: number | undefined): string | undefined {
  if (!ts) return undefined;
  const diffSec = Math.floor(Date.now() / 1000 - ts);
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
  return new Date(ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Character list view — the main "Chats" tab.
 * Shows a compact stats bar (messages, sessions, memories) followed by
 * tappable character cards. Clicking a card opens the ChatThread.
 * Last message previews and relative timestamps are fetched once on mount.
 */
export function ChatsView() {
  const { characters, selectCharacter } = useAppStore();
  const [recentMessages, setRecentMessages] = useState<Record<string, { text: string; ts: number }>>({});

  useEffect(() => {
    api.getRecentMessagesPerChar()
      .then(setRecentMessages)
      .catch(() => {});
  }, []);

  // Sort characters by most recent message (desc), unseen characters last
  const sortedCharacters = [...characters].sort((a, b) => {
    const tsA = recentMessages[String(a.id)]?.ts ?? 0;
    const tsB = recentMessages[String(b.id)]?.ts ?? 0;
    return tsB - tsA;
  });

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h2
        className="text-xl font-bold mb-1 tracking-tight"
        style={{ color: 'var(--color-text-primary)' }}
      >
        Chats
      </h2>
      <p className="text-xs mb-3" style={{ color: 'var(--color-text-tertiary)' }}>
        {characters.length} character{characters.length !== 1 ? 's' : ''}
      </p>

      <StatsBar />

      <div className="flex flex-col gap-2">
        {characters.length === 0 ? (
          <div
            className="text-center py-16 rounded-2xl"
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px dashed var(--color-border)',
            }}
          >
            <p className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              No characters yet
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
              Create one in the Create tab
            </p>
          </div>
        ) : (
          sortedCharacters.map((char) => {
            const recent = recentMessages[String(char.id)];
            return (
              <CharacterCard
                key={char.id}
                character={char}
                onClick={() => selectCharacter(char)}
                lastMessage={recent?.text}
                timestamp={relativeTime(recent?.ts)}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
