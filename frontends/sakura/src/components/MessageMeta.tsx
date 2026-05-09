import type { ChatMessage } from '../lib/types';

/**
 * Hover-to-reveal metadata for assistant messages: token count, tok/s, TTFT, server latency, model.
 * Only renders for assistant messages that have token data.
 */
export function MessageMeta({ message }: { message: ChatMessage }) {
  if (message.role !== 'assistant' || !message.tokens) return null;

  const ttft = message.firstTokenMs;
  const ttftLabel = ttft == null ? null
    : ttft >= 1000 ? `${(ttft / 1000).toFixed(1)}s TTFT`
    : `${ttft}ms TTFT`;

  return (
    <div className="dialogue-meta flex items-center gap-3 mt-1 text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
      {message.tokens != null && <span>{message.tokens} tok</span>}
      {message.tokensPerSecond != null && <span>{message.tokensPerSecond.toFixed(1)} tok/s</span>}
      {ttft != null && ttft > 500 && <span title="Time to first token (prefill latency)">{ttftLabel}</span>}
      {message.latencyMs != null && <span title="Server-reported generation time">{message.latencyMs}ms gen</span>}
      {message.model && <span>{message.model}</span>}
    </div>
  );
}
