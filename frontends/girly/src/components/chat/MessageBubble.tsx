/**
 * MessageBubble – renders a single chat message.
 *
 * Layout:
 *   - User messages: right-aligned, theme-aware companion bubble.
 *   - Assistant messages: left-aligned, purple overlay background with a
 *     subtle left border accent and a soft glow.
 *   - Director notes: centered, amber/gold cinematic styling with a
 *     film-clapper icon — visually distinct "out-of-character" stage
 *     direction that the user added via Director Mode.
 *   - Thought bubbles: collapsible translucent panel above assistant
 *     messages showing the AI's inner reasoning from `<think>` tags.
 *
 * @param message - The ChatMessage to render.
 */

import { useState } from 'react';
import { type ChatMessage } from '../../types/index.ts';

interface Props {
  message: ChatMessage;
  emotionLabel?: string;
  emotionToneClass?: string;
  memoryBadges?: string[];
  /** Names of activated lorebook entries keyed by id, for the activation indicator. */
  lorebookEntryNames?: Record<string, string>;
}

export default function MessageBubble({
  message,
  emotionLabel,
  emotionToneClass = 'border-anime-100 bg-anime-50 text-text-muted',
  memoryBadges = [],
  lorebookEntryNames = {},
}: Props) {
  const isUser = message.role === 'user';
  const isDirector = message.role === 'director';
  const [thoughtsOpen, setThoughtsOpen] = useState(false);
  const [loreOpen, setLoreOpen] = useState(false);

  // Format timestamp as HH:MM in local time.
  const timeLabel = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  /* ── Director Note – centered cinematic card ── */
  if (isDirector) {
    return (
      <div className="motion-message-in flex flex-col items-center">
        <div className="max-w-[90%] w-fit">
          {/* Decorative separator */}
          <div className="flex items-center gap-3 mb-1.5">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-400/30 to-transparent" />
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-widest text-amber-400/70 uppercase">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              Director
            </span>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-400/30 to-transparent" />
          </div>

          {/* Note body */}
          <div
            className={[
              'rounded-2xl border border-amber-400/25 bg-amber-500/8 px-4 py-2.5 text-center',
              'text-[13px] leading-relaxed text-amber-300/90 italic',
              'shadow-[0_4px_20px_-8px_rgba(251,191,36,0.15)]',
            ].join(' ')}
          >
            {message.content}
          </div>

          {/* Timestamp */}
          <span className="block text-center text-[10px] text-amber-400/40 mt-1">{timeLabel}</span>
        </div>
      </div>
    );
  }

  /* ── User / Assistant bubble ── */
  return (
    <div className={`motion-message-in flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      {(emotionLabel || memoryBadges.length > 0) && (
        <div className={`mb-1 flex max-w-[85%] flex-wrap gap-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
          {emotionLabel && (
            <span className={`rounded-pill border px-2 py-0.5 text-[10px] font-medium ${emotionToneClass}`}>
              {emotionLabel}
            </span>
          )}
          {memoryBadges.map((badge) => (
            <span
              key={badge}
              className="rounded-pill border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700"
            >
              {badge}
            </span>
          ))}
        </div>
      )}

      {/* Thought bubble — collapsible inner monologue from <think> tags */}
      {!isUser && message.thoughts && (
        <div className="max-w-[85%] mb-1">
          <button
            type="button"
            onClick={() => setThoughtsOpen((prev) => !prev)}
            className="flex items-center gap-1 text-[10px] font-medium text-violet-400/80 hover:text-violet-300 transition-colors"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform duration-200 ${thoughtsOpen ? 'rotate-90' : ''}`}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Inner thoughts
          </button>
          {thoughtsOpen && (
            <div
              className={[
                'mt-1 rounded-xl border border-violet-400/20 bg-violet-500/8 px-3 py-2',
                'text-[12px] leading-relaxed text-violet-300/80 italic',
                'shadow-[0_2px_12px_-4px_rgba(139,92,246,0.15)]',
                'animate-in fade-in slide-in-from-top-1 duration-200',
              ].join(' ')}
            >
              {message.thoughts}
            </div>
          )}
        </div>
      )}

      {/* Bubble */}
      <div
        className={[
          'max-w-[85%] break-words px-3 py-2 text-sm leading-relaxed shadow-[0_10px_24px_-20px_var(--color-glow-primary)]',
          isUser
            ? 'chat-bubble-user text-text-primary rounded-bubble rounded-br-sm border'
            : 'chat-bubble-assistant text-text-secondary rounded-bubble rounded-bl-sm border border-l-2',
        ].join(' ')}
      >
        {message.content}
        {/* Blinking cursor – visible only while the assistant stream is live. */}
        {!isUser && message.isStreaming && (
          <span className="inline-block w-0.5 h-4 bg-anime-400 animate-pulse ml-0.5 align-middle" />
        )}
      </div>

      {/* Lorebook activation indicator */}
      {!isUser && message.activatedLorebookEntryIds && message.activatedLorebookEntryIds.length > 0 && (
        <div className="max-w-[85%] mt-1">
          <button
            type="button"
            onClick={() => setLoreOpen((prev) => !prev)}
            className="flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-[10px] font-medium text-teal-700 transition-colors hover:bg-teal-100"
            aria-expanded={loreOpen}
            aria-label={`Story Bible: ${message.activatedLorebookEntryIds.length} entries activated`}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform duration-200 ${loreOpen ? 'rotate-90' : ''}`}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            Story Bible: {message.activatedLorebookEntryIds.length}{' '}
            {message.activatedLorebookEntryIds.length === 1 ? 'entry' : 'entries'}
          </button>
          {loreOpen && (
            <div className="mt-1 rounded-xl border border-teal-200 bg-teal-50/60 px-3 py-2 text-[11px] text-teal-700 animate-in fade-in slide-in-from-top-1 duration-200">
              <ul className="space-y-0.5">
                {message.activatedLorebookEntryIds.map((id) => (
                  <li key={id} className="flex items-center gap-1.5">
                    <span className="h-1 w-1 shrink-0 rounded-full bg-teal-400" />
                    {lorebookEntryNames[id] || id}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Timestamp */}
      <span className="text-xs text-text-muted mt-0.5 px-1">{timeLabel}</span>
    </div>
  );
}
