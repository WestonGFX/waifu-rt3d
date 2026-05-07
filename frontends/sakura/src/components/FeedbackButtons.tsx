import { useState } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { api } from '../lib/api';

interface FeedbackButtonsProps {
  messageId: number;
  initialSignal?: 1 | -1 | null;
  onSignalChange?: (signal: 1 | -1 | null) => void;
}

/**
 * Hover-revealed 👍/👎 feedback buttons for assistant message bubbles.
 *
 * Clicking a button latches it (fills with accent colour). Clicking the same
 * button again clears the signal. Calls the feedback API on every state change.
 * Renders nothing when invoked — but visibility is controlled by the parent's
 * hover state via CSS (opacity toggling).
 */
export function FeedbackButtons({ messageId, initialSignal = null, onSignalChange }: FeedbackButtonsProps) {
  const [signal, setSignal] = useState<1 | -1 | null>(initialSignal);
  const [pending, setPending] = useState(false);

  async function handleClick(clicked: 1 | -1) {
    if (pending) return;
    const next: 1 | -1 | null = signal === clicked ? null : clicked;
    setSignal(next);
    onSignalChange?.(next);
    setPending(true);
    try {
      await api.recordFeedback(messageId, next);
    } catch {
      // Roll back on network failure
      setSignal(signal);
      onSignalChange?.(signal);
    } finally {
      setPending(false);
    }
  }

  const upActive = signal === 1;
  const downActive = signal === -1;

  return (
    <>
      <button
        onClick={() => handleClick(1)}
        disabled={pending}
        className="p-0.5 rounded transition-colors disabled:opacity-50"
        style={{
          color: upActive ? 'var(--color-success, #4ade80)' : 'var(--color-text-tertiary)',
          opacity: upActive ? 1 : undefined,
        }}
        title={upActive ? 'Remove thumbs-up' : 'Thumbs up'}
        aria-label={upActive ? 'Remove thumbs-up' : 'Thumbs up'}
        aria-pressed={upActive}
      >
        <ThumbsUp size={11} />
      </button>
      <button
        onClick={() => handleClick(-1)}
        disabled={pending}
        className="p-0.5 rounded transition-colors disabled:opacity-50"
        style={{
          color: downActive ? 'var(--color-error, #f87171)' : 'var(--color-text-tertiary)',
          opacity: downActive ? 1 : undefined,
        }}
        title={downActive ? 'Remove thumbs-down' : 'Thumbs down'}
        aria-label={downActive ? 'Remove thumbs-down' : 'Thumbs down'}
        aria-pressed={downActive}
      >
        <ThumbsDown size={11} />
      </button>
    </>
  );
}
