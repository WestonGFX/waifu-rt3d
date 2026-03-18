/**
 * MessageList – renders the chat history with auto-scroll.
 *
 * Auto-scroll strategy:
 *   A sentinel <div> with a ref sits at the very bottom of the list.
 *   Whenever `messages.length` changes a useEffect fires and scrolls
 *   the sentinel into view with smooth behaviour.
 *
 *   Why a sentinel instead of scrolling the container directly:
 *     Measuring the container's scrollHeight is fragile inside flex/grid
 *     layouts.  scrollIntoView on a child element works reliably regardless
 *     of the parent's layout mode.
 */

import { useRef, useEffect } from 'react';
import { useChat } from '../../context/ChatContext.tsx';
import { useCompanion } from '../../context/CompanionContext.tsx';
import {
  getMemoriesCreatedFromMessage,
  getMessageEmotionSignal,
} from '../../services/conversationSignalsService.ts';
import MessageBubble from './MessageBubble.tsx';

interface MessageListProps {
  scrollMode?: 'contained' | 'page';
  emptyStateVariant?: 'default' | 'loaded-room-fresh-chat';
}

export default function MessageList({
  scrollMode = 'contained',
  emptyStateVariant = 'default',
}: MessageListProps) {
  const { state } = useChat();
  const { state: companionState, activePersona, currentThread } = useCompanion();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const usePageScroll = scrollMode === 'page';
  const boundedContainedEmptyState = !usePageScroll && emptyStateVariant === 'loaded-room-fresh-chat';

  // Track the last message's content length so the scroll trigger fires on
  // every streaming chunk, not just when a new message is appended.
  const lastContentLen = state.messages.length > 0
    ? state.messages[state.messages.length - 1].content.length
    : 0;

  useEffect(() => {
    if (usePageScroll) {
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  }, [lastContentLen, state.messages.length, usePageScroll]);

  // Empty state
  if (state.messages.length === 0) {
    return (
      <div className={usePageScroll ? 'relative min-h-[clamp(12rem,20dvh,16rem)] px-4 pb-1.5 pt-1 md:px-5' : 'relative h-full min-h-0 px-4 pb-1.5 pt-1 md:px-5'}>
        <div
          data-testid="empty-message-surface"
          ref={containerRef}
          className={[
            'message-scroll-surface motion-content flex justify-center rounded-[24px] border border-[color:var(--control-border-soft)] px-5 pb-4.5 pt-3 shadow-[var(--shell-shadow-soft)]',
            usePageScroll ? 'items-center' : 'items-start',
            usePageScroll
              ? 'min-h-[clamp(12rem,20dvh,16rem)] overflow-visible'
              : boundedContainedEmptyState
                ? 'min-h-[clamp(7.5rem,10dvh,8.5rem)] max-h-[clamp(9rem,15dvh,10.5rem)] overflow-y-auto'
                : 'min-h-[clamp(10rem,22dvh,14rem)] max-h-full overflow-y-auto',
          ].join(' ')}
        >
          <div className={`max-w-xs rounded-[20px] border border-[color:var(--control-border-soft)] bg-[color:var(--card-bg)] px-4.5 py-2.75 text-center shadow-[var(--shell-shadow-soft)] ${usePageScroll ? '' : boundedContainedEmptyState ? 'mt-2' : 'mt-4'}`}>
            <p className="text-text-secondary text-sm font-medium">
              Start a conversation
            </p>
            <p className="mt-1 text-xs text-text-muted">
              Type a message or use voice input.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={usePageScroll ? 'relative px-4 pb-1.5 pt-1 md:px-5' : 'relative h-full min-h-0 px-4 pb-1.5 pt-1 md:px-5'}>
      <div
        ref={containerRef}
        className={[
          'message-scroll-surface motion-content flex flex-col gap-2 rounded-[24px] border border-[color:var(--control-border-soft)] px-4 pb-3 pt-2 shadow-[var(--shell-shadow-soft)]',
          usePageScroll ? 'overflow-visible' : 'h-full min-h-0 overflow-y-auto',
        ].join(' ')}
      >
        {state.messages.map((msg) => {
          const emotionSignal = getMessageEmotionSignal(msg);
          const relatedMemories = currentThread
            ? getMemoriesCreatedFromMessage(
                msg.id,
                companionState.memoryRecords.filter((memory) => (
                  memory.threadId === currentThread.id &&
                  (!activePersona || memory.personaId === activePersona.id)
                )),
              )
            : [];

          return (
            <MessageBubble
              key={msg.id}
              message={msg}
              emotionLabel={emotionSignal.label}
              emotionToneClass={emotionSignal.toneClass}
              memoryBadges={relatedMemories.slice(0, 2).map((memory) => `Memory: ${memory.kind}`)}
            />
          );
        })}

        {/* Loading indicator – pulsing dots while the LLM is thinking.
            Once the streaming assistant message exists the growing text +
            blinking cursor is sufficient feedback; hide dots to avoid clutter. */}
        {state.isLoading && !(
          state.messages.length > 0 &&
          state.messages[state.messages.length - 1].role === 'assistant' &&
          state.messages[state.messages.length - 1].isStreaming
        ) && (
          <div className="flex justify-start">
            <div className="rounded-bubble border border-[color:var(--control-border)] bg-[color:var(--control-bg-soft)] px-4 py-2 shadow-[var(--shell-shadow-soft)]">
              <span className="inline-flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-anime-400" style={{ animationDelay: '0ms' }} />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-anime-400" style={{ animationDelay: '150ms' }} />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-anime-400" style={{ animationDelay: '300ms' }} />
              </span>
            </div>
          </div>
        )}

        {/* Sentinel for auto-scroll */}
        <div ref={sentinelRef} />
      </div>
    </div>
  );
}
