import { Volume2 } from 'lucide-react';
import type { ChatMessage, Character } from '../lib/types';
import { MessageMeta } from './MessageMeta';

/** Maps detected emotion tags to emoji for display in the message header. */
const EMOTION_EMOJI: Record<string, string> = {
  happy: '😊', excited: '✨', sad: '🥺', angry: '😤',
  nervous: '😰', surprised: '😮', embarrassed: '😳', shy: '🫣',
  flirty: '💕', teasing: '😏', cool: '😎', thoughtful: '🤔',
  neutral: '', love: '❤️', playful: '🎉', serious: '😐',
};

/** Image extensions the browser can render in an img tag. */
const IMAGE_EXTS = /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i;

/** Returns true if the URL points to a renderable image (not VRM/3D model). */
function isImageUrl(url?: string): boolean {
  if (!url) return false;
  try {
    return IMAGE_EXTS.test(new URL(url, window.location.origin).pathname);
  } catch {
    return IMAGE_EXTS.test(url);
  }
}

/** Resolve avatar with pixel portrait fallback (same as CharacterCard). */
function resolveAvatarUrl(name?: string, avatarUrl?: string): string | null {
  if (isImageUrl(avatarUrl)) return avatarUrl!;
  const parenMatch = name?.match(/\(([^)]+)\)/);
  const cleanName = parenMatch
    ? parenMatch[1].trim().toLowerCase()
    : (name?.split(/\s/)[0] || '').toLowerCase();
  if (cleanName) return `/files/images/${cleanName}_pixel_portrait.png`;
  return null;
}

interface DialogueBubbleProps {
  message: ChatMessage;
  character?: Character;
  onPlayAudio?: () => void;
  isPlaying?: boolean;
  searchQuery?: string;
}

/** Highlight occurrences of `query` inside `text` using <mark> spans. */
function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} style={{ backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)', borderRadius: '2px', padding: '0 1px' }}>
            {part}
          </mark>
        ) : part
      )}
    </>
  );
}

/**
 * Visual novel style message bubble.
 * User messages render as right-aligned accent-gradient bubbles.
 * Assistant messages render as left-aligned cards with avatar, name, and hover metadata.
 * Uses CSS animations from dialogue.css for entrance and components.css for typing dots.
 */
export function DialogueBubble({ message, character, onPlayAudio, isPlaying, searchQuery = '' }: DialogueBubbleProps) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end mb-3">
        <div
          className="dialogue-bubble dialogue-you px-4 py-2.5 max-w-[75%] text-sm"
          style={{ borderRadius: 'var(--radius-card)' }}
        >
          <HighlightedText text={message.text} query={searchQuery} />
        </div>
      </div>
    );
  }

  return (
    <div className="dialogue-bubble mb-3">
      <div
        className="dialogue-her p-4"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-card)',
          boxShadow: 'var(--shadow-card)'
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          {resolveAvatarUrl(character?.name, character?.avatar_url) ? (
            <img src={resolveAvatarUrl(character?.name, character?.avatar_url)!} alt="" className="w-8 h-8 rounded-full object-cover" />
          ) : (
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
              style={{
                background: 'var(--color-accent-gradient)',
                color: 'var(--color-accent-text)',
                fontSize: '0.8rem',
                fontWeight: 600
              }}
            >
              {character?.name?.[0] ?? '?'}
            </div>
          )}
          <span className="font-semibold text-sm" style={{ color: 'var(--color-accent)' }}>
            {character?.name || 'Assistant'}
          </span>
          {message.emotion && message.emotion !== 'neutral' && EMOTION_EMOJI[message.emotion] && (
            <span title={message.emotion} style={{ fontSize: '0.85rem', lineHeight: 1 }}>
              {EMOTION_EMOJI[message.emotion]}
            </span>
          )}
          {message.audioUrl && onPlayAudio && (
            <button
              onClick={onPlayAudio}
              className="ml-auto p-1.5 rounded-lg transition-all duration-200"
              style={{
                color: isPlaying ? 'var(--color-accent-text)' : 'var(--color-accent)',
                background: isPlaying ? 'var(--color-accent-gradient)' : 'transparent',
              }}
            >
              <Volume2 size={14} className={isPlaying ? 'animate-pulse' : ''} />
            </button>
          )}
        </div>
        <div className="text-sm leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>
          {message.status === 'pending' ? (
            <div className="flex items-center gap-1 py-1">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          ) : message.status === 'streaming' ? (
            <span>
              {message.text}
              <span className="inline-block w-0.5 h-4 ml-0.5 animate-pulse align-text-bottom"
                style={{ backgroundColor: 'var(--color-accent)' }} />
            </span>
          ) : (
            <HighlightedText text={message.text} query={searchQuery} />
          )}
        </div>
        <MessageMeta message={message} />
      </div>
    </div>
  );
}
