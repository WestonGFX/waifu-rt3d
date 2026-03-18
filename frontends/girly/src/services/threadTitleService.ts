/**
 * Thread title generation — waifu-rt3d adapter.
 *
 * The LLM-based title generator is stubbed to return null because
 * waifu-rt3d's backend handles auto-titling natively. ChatContext
 * falls back to heuristic titles when this returns null.
 */
import {
  type ChatThread,
  type PersonaProfile,
} from '../types/companion.ts';
import { type ChatMessage, type ProviderConfig } from '../types/index.ts';

export function buildHeuristicThreadTitle(messages: ChatMessage[]): string | null {
  const firstUserMessage = messages.find((message) => message.role === 'user' && message.content.trim().length > 0);
  if (!firstUserMessage) return null;
  const normalized = firstUserMessage.content.trim().replace(/\s+/g, ' ');
  if (!normalized) return null;
  return normalized.length > 42 ? `${normalized.slice(0, 41).trimEnd()}…` : normalized;
}

export function buildTimestampThreadTitle(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(timestamp);
}

export async function generateThreadTitleWithLLM(
  _thread: ChatThread,
  _messages: ChatMessage[],
  _persona: PersonaProfile | null,
  _providerConfig: ProviderConfig,
): Promise<string | null> {
  // waifu-rt3d backend handles auto-titling; return null → heuristic fallback
  return null;
}
