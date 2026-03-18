import { executeLLM } from '../providers/registry.ts';
import {
  type ChatThread,
  type PersonaProfile,
} from '../types/companion.ts';
import { type ChatMessage, type ProviderConfig } from '../types/index.ts';

function cleanTitle(raw: string): string {
  return raw
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.?!]+$/, '');
}

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
  thread: ChatThread,
  messages: ChatMessage[],
  persona: PersonaProfile | null,
  providerConfig: ProviderConfig,
): Promise<string | null> {
  const firstUser = messages.find((message) => message.role === 'user' && message.content.trim().length > 0);
  const firstAssistant = messages.find((message) => message.role === 'assistant' && !message.isStreaming && message.content.trim().length > 0);
  if (!firstUser || !firstAssistant) return null;

  const promptMessages = [
    {
      role: 'system',
      content: [
        'You write short conversation titles for a messaging app.',
        'Return only a short title, 2 to 5 words if possible.',
        'No quotes. No markdown. No speaker labels. No explanation.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        `Persona: ${persona?.name ?? 'Unknown persona'}`,
        `User opener: ${firstUser.content}`,
        `Assistant reply: ${firstAssistant.content}`,
        `Current placeholder title: ${thread.title}`,
        'Write a concise chat title:',
      ].join('\n'),
    },
  ];

  try {
    const result = await executeLLM(promptMessages, providerConfig.llm, { maxTokens: 20 }, providerConfig.providerOptions);
    const cleaned = cleanTitle(result);
    return cleaned || null;
  } catch {
    return null;
  }
}
