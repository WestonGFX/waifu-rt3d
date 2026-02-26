import type { Character } from '../lib/types';

/** Image extensions the browser can render as a background-image. */
const IMAGE_EXTS = /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i;

/**
 * Returns true if the URL points to a renderable image file.
 * VRM, ONNX, and other non-image files return false.
 */
function isImageUrl(url?: string): boolean {
  if (!url) return false;
  try {
    const path = new URL(url, window.location.origin).pathname;
    return IMAGE_EXTS.test(path);
  } catch {
    return IMAGE_EXTS.test(url);
  }
}

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
  const hasImage = isImageUrl(character.avatar_url);

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
        className="w-12 h-12 rounded-full bg-cover bg-center flex-shrink-0 flex items-center justify-center"
        style={{
          backgroundImage: hasImage ? `url(${character.avatar_url})` : undefined,
          backgroundColor: hasImage ? undefined : 'var(--color-accent)',
          color: 'white',
          fontSize: '1.1rem',
          fontWeight: 600
        }}
      >
        {!hasImage && (character.name?.[0] ?? '?')}
      </div>
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
