import type { ChatMessage } from '../lib/types';

/**
 * Hover-to-reveal metadata for assistant messages: token count, tok/s, latency, model.
 * Only renders for assistant messages that have token data.
 */
export function MessageMeta({ message }: { message: ChatMessage }) {
  if (message.role !== 'assistant' || !message.tokens) return null;

  return (
    <div className="dialogue-meta flex items-center gap-3 mt-1 text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
      {message.tokens != null && <span>{message.tokens} tok</span>}
      {message.tokensPerSecond != null && <span>{message.tokensPerSecond.toFixed(1)} tok/s</span>}
      {message.latencyMs != null && <span>{message.latencyMs}ms TTFT</span>}
      {message.model && <span>{message.model}</span>}
    </div>
  );
}
