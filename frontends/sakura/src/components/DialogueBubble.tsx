import { Volume2 } from 'lucide-react';
import type { ChatMessage, Character } from '../lib/types';
import { MessageMeta } from './MessageMeta';

interface DialogueBubbleProps {
  message: ChatMessage;
  character?: Character;
  onPlayAudio?: () => void;
  isPlaying?: boolean;
}

/**
 * Visual novel style message bubble.
 * User messages render as right-aligned accent-colored bubbles.
 * Assistant messages render as left-aligned cards with avatar, name, and hover metadata.
 */
export function DialogueBubble({ message, character, onPlayAudio, isPlaying }: DialogueBubbleProps) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end mb-3">
        <div
          className="dialogue-you px-4 py-2.5 max-w-[75%] text-sm"
          style={{ borderRadius: 'var(--radius-card)' }}
        >
          {message.text}
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
          {character?.avatar_url && (
            <img src={character.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
          )}
          <span className="font-semibold text-sm" style={{ color: 'var(--color-accent)' }}>
            {character?.name || 'Assistant'}
          </span>
          {message.audioUrl && onPlayAudio && (
            <button
              onClick={onPlayAudio}
              className="ml-auto p-1 transition-opacity"
              style={{ color: 'var(--color-accent)' }}
            >
              <Volume2 size={14} className={isPlaying ? 'animate-pulse' : ''} />
            </button>
          )}
        </div>
        <div className="text-sm leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>
          {message.status === 'pending' ? (
            <span className="animate-pulse" style={{ color: 'var(--color-text-secondary)' }}>thinking...</span>
          ) : (
            message.text
          )}
        </div>
        <MessageMeta message={message} />
      </div>
    </div>
  );
}
