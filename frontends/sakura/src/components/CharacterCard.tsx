import type { Character } from '../lib/types';

interface CharacterCardProps {
  character: Character;
  onClick: () => void;
  lastMessage?: string;
  timestamp?: string;
}

/**
 * Compact card showing a character's avatar, name, and last message preview.
 * Used in the ChatsView character list.
 *
 * @param character - The character data to display
 * @param onClick - Callback when the card is tapped (opens chat thread)
 * @param lastMessage - Optional last message preview text
 * @param timestamp - Optional timestamp string for the last message
 */
export function CharacterCard({ character, onClick, lastMessage, timestamp }: CharacterCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 transition-colors duration-150 text-left"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderRadius: 'var(--radius-card)',
        boxShadow: 'var(--shadow-card)',
        border: '1px solid var(--color-border)'
      }}
    >
      <div
        className="w-12 h-12 rounded-full bg-cover bg-center flex-shrink-0"
        style={{
          backgroundImage: character.avatar_url ? `url(${character.avatar_url})` : undefined,
          backgroundColor: character.avatar_url ? undefined : 'var(--color-border)'
        }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>
            {character.name}
          </span>
          {timestamp && (
            <span className="text-xs flex-shrink-0 ml-2" style={{ color: 'var(--color-text-secondary)' }}>
              {timestamp}
            </span>
          )}
        </div>
        <p className="text-xs truncate mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
          {lastMessage || character.greeting_message || 'Start a conversation...'}
        </p>
      </div>
    </button>
  );
}
