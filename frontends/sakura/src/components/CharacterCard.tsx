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

/**
 * Resolve the best avatar image URL for a character.
 * Uses the same fallback logic as Neon's CharacterGrid:
 * 1. avatar_url if it's a renderable image
 * 2. Convention-based pixel portrait: /files/images/{name}_pixel_portrait.png
 *    where {name} is extracted from parentheses or first word lowercased
 */
function resolveAvatarUrl(character: Character): string | null {
  if (isImageUrl(character.avatar_url)) return character.avatar_url!;
  // Extract clean name: "Fox (Rin)" → "rin", "Tsundere (Raine)" → "raine"
  const parenMatch = character.name?.match(/\(([^)]+)\)/);
  const cleanName = parenMatch
    ? parenMatch[1].trim().toLowerCase()
    : (character.name?.split(/\s/)[0] || '').toLowerCase();
  if (cleanName) return `/files/images/${cleanName}_pixel_portrait.png`;
  return null;
}

interface CharacterCardProps {
  character: Character;
  onClick: () => void;
  lastMessage?: string;
  timestamp?: string;
}

/**
 * Compact card showing a character's avatar, name, and last message preview.
 * Used in the ChatsView character list. Features hover-lift effect and
 * accent-tinted shadow for a premium feel.
 *
 * @param character - The character data to display
 * @param onClick - Callback when the card is tapped (opens chat thread)
 * @param lastMessage - Optional last message preview text
 * @param timestamp - Optional timestamp string for the last message
 */
export function CharacterCard({ character, onClick, lastMessage, timestamp }: CharacterCardProps) {
  const avatarUrl = resolveAvatarUrl(character);
  const hasImage = avatarUrl !== null;

  return (
    <button
      onClick={onClick}
      className="character-card w-full flex items-center gap-3 p-3 text-left transition-all duration-200"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderRadius: 'var(--radius-card)',
        boxShadow: 'var(--shadow-card)',
        border: '1px solid var(--color-border-subtle)',
      }}
    >
      {/* Avatar circle with accent ring on hover (handled by CSS) */}
      <div
        className="w-12 h-12 rounded-full bg-cover bg-center flex-shrink-0 flex items-center justify-center ring-2 ring-transparent transition-all duration-200"
        style={{
          backgroundImage: hasImage ? `url(${avatarUrl})` : undefined,
          backgroundColor: hasImage ? undefined : 'var(--color-accent)',
          color: 'var(--color-accent-text)',
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
            <span className="text-[10px] flex-shrink-0 ml-2" style={{ color: 'var(--color-text-tertiary)' }}>
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
