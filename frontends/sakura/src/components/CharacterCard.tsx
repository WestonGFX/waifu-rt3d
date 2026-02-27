import { useEffect, useState } from 'react';
import { Share2 } from 'lucide-react';
import type { Character } from '../lib/types';
import { api } from '../lib/api';

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

/** Converts 0-1 affinity score to a human-readable relationship tier label. */
function affinityLabel(v: number): string {
  if (v >= 0.85) return 'Devoted';
  if (v >= 0.7)  return 'Close';
  if (v >= 0.55) return 'Friendly';
  if (v >= 0.4)  return 'Neutral';
  return 'Distant';
}

/** Color for the affinity bar based on score. */
function affinityColor(v: number): string {
  if (v >= 0.7) return 'var(--color-success)';
  if (v >= 0.4) return 'var(--color-accent)';
  return 'var(--color-text-tertiary)';
}

interface CharacterCardProps {
  character: Character;
  onClick: () => void;
  lastMessage?: string;
  timestamp?: string;
}

/**
 * Compact card showing a character's avatar, name, relationship level, and
 * message preview. Used in the ChatsView character list.
 *
 * Lazily fetches relationship data (affinity, interactions) on mount to show
 * a small affinity bar and tier label (Devoted / Close / Friendly / etc.)
 * matching Neon's character grid behavior.
 */
export function CharacterCard({ character, onClick, lastMessage, timestamp }: CharacterCardProps) {
  const avatarUrl = resolveAvatarUrl(character);
  const hasImage = avatarUrl !== null;
  const [imgFailed, setImgFailed] = useState(false);
  const [affinity, setAffinity] = useState<number | null>(null);
  const [interactions, setInteractions] = useState<number>(0);

  useEffect(() => {
    api.getRelationship(character.id)
      .then(rel => {
        setAffinity(rel.affinity);
        setInteractions(rel.interactions);
      })
      .catch(() => {});
  }, [character.id]);

  /**
   * Export the character as a JSON file download.
   * Calls the export endpoint and triggers a browser download of the
   * sanitized character card JSON. Stops propagation so the card's
   * own onClick (open chat) is not triggered.
   */
  const handleExport = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const data = await api.exportCharacter(character.id);
      const blob = new Blob([JSON.stringify(data.character, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(character.name ?? 'character').replace(/[^a-z0-9]/gi, '_')}_character.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  const showImage = hasImage && !imgFailed;

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
      {/* Avatar */}
      {showImage ? (
        <img
          src={avatarUrl!}
          alt={character.name || ''}
          onError={() => setImgFailed(true)}
          className="w-12 h-12 rounded-full object-cover flex-shrink-0"
        />
      ) : (
        <div
          className="w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center"
          style={{
            backgroundColor: hasImage && !imgFailed ? undefined : 'var(--color-accent)',
            color: 'var(--color-accent-text)',
            fontSize: '1.1rem',
            fontWeight: 600,
          }}
        >
          {character.name?.[0] ?? '?'}
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>
            {character.name}
          </span>
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
            {affinity !== null && (
              <span className="text-[9px] font-medium" style={{ color: affinityColor(affinity) }}>
                {affinityLabel(affinity)}
              </span>
            )}
            {timestamp && (
              <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                {timestamp}
              </span>
            )}
            {/* Export/share button — does not open the chat */}
            <button
              type="button"
              onClick={handleExport}
              title="Export character card"
              aria-label="Export character card"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '2px',
                borderRadius: 4,
                color: 'var(--color-text-tertiary)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                opacity: 0.6,
              }}
            >
              <Share2 size={12} />
            </button>
          </div>
        </div>

        {/* Affinity mini-bar + interaction count */}
        {affinity !== null && (
          <div className="flex items-center gap-2 mt-0.5 mb-0.5">
            <div style={{ width: 48, height: 2, borderRadius: 99, backgroundColor: 'var(--color-border)' }}>
              <div
                style={{
                  width: `${Math.round(affinity * 100)}%`,
                  height: '100%',
                  borderRadius: 99,
                  backgroundColor: affinityColor(affinity),
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
            {interactions > 0 && (
              <span className="text-[9px]" style={{ color: 'var(--color-text-tertiary)' }}>
                {interactions} chats
              </span>
            )}
          </div>
        )}

        <p className="text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>
          {lastMessage || character.greeting_message || 'Start a conversation...'}
        </p>
      </div>
    </button>
  );
}
