import {
  type ChatMessage,
  type SharedConversationMoment,
} from '../types/index.ts';

const SHARE_PARAM = 'share';
const SHARE_VERSION = 1;
const MAX_SHARED_USER_CHARS = 220;
const MAX_SHARED_ASSISTANT_CHARS = 900;

function normalizeSharedContent(content: string, maxChars: number): string {
  const normalized = content.trim().replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars - 1).trimEnd()}…`;
}

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const safeValue = padded.padEnd(Math.ceil(padded.length / 4) * 4, '=');
  const binary = atob(safeValue);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function isValidSharedMoment(value: unknown): value is SharedConversationMoment {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Partial<SharedConversationMoment>;
  return (
    candidate.version === SHARE_VERSION &&
    candidate.source === 'animegirly' &&
    typeof candidate.createdAt === 'number' &&
    Array.isArray(candidate.messages) &&
    candidate.messages.length === 2 &&
    candidate.messages.every((message) => (
      !!message &&
      (message.role === 'user' || message.role === 'assistant') &&
      typeof message.content === 'string' &&
      typeof message.timestamp === 'number'
    ))
  );
}

export function buildShareableMoment(messages: ChatMessage[]): SharedConversationMoment | null {
  const assistantIndex = [...messages].findLastIndex((message) => (
    message.role === 'assistant' &&
    !message.isStreaming &&
    message.content.trim().length > 0
  ));

  if (assistantIndex === -1) return null;

  const userIndex = messages
    .slice(0, assistantIndex)
    .findLastIndex((message) => message.role === 'user' && message.content.trim().length > 0);

  if (userIndex === -1) return null;

  const userMessage = messages[userIndex];
  const assistantMessage = messages[assistantIndex];

  return {
    version: SHARE_VERSION,
    source: 'animegirly',
    createdAt: Date.now(),
    messages: [
      {
        role: 'user',
        content: normalizeSharedContent(userMessage.content, MAX_SHARED_USER_CHARS),
        timestamp: userMessage.timestamp,
      },
      {
        role: 'assistant',
        content: normalizeSharedContent(assistantMessage.content, MAX_SHARED_ASSISTANT_CHARS),
        timestamp: assistantMessage.timestamp,
      },
    ],
  };
}

export function createShareMomentUrl(
  moment: SharedConversationMoment,
  href = window.location.href,
): string {
  const url = new URL(href);
  url.hash = `${SHARE_PARAM}=${toBase64Url(JSON.stringify(moment))}`;
  return url.toString();
}

export function parseShareMomentFromLocation(
  href = window.location.href,
): SharedConversationMoment | null {
  try {
    const url = new URL(href);
    const hashValue = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
    const hashParams = new URLSearchParams(hashValue);
    const encoded = url.searchParams.get(SHARE_PARAM) ?? hashParams.get(SHARE_PARAM);

    if (!encoded) return null;

    const decoded = JSON.parse(fromBase64Url(encoded)) as unknown;
    return isValidSharedMoment(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

export function clearSharedMomentFromLocation(href = window.location.href): void {
  const url = new URL(href);

  if (url.searchParams.has(SHARE_PARAM)) {
    url.searchParams.delete(SHARE_PARAM);
  }

  if (url.hash.startsWith(`#${SHARE_PARAM}=`)) {
    url.hash = '';
  }

  window.history.replaceState({}, document.title, url.toString());
}

export function createImportedMessagesFromSharedMoment(
  moment: SharedConversationMoment,
): ChatMessage[] {
  return moment.messages.map((message, index) => ({
    id: `shared-${message.role}-${moment.createdAt}-${index}`,
    role: message.role,
    content: message.content.trim(),
    timestamp: message.timestamp,
  }));
}

export function buildShareMomentCopy(moment: SharedConversationMoment): string {
  const assistantMessage = moment.messages[1];
  const preview = assistantMessage.content.replace(/\s+/g, ' ').trim();
  const clippedPreview = preview.length > 96 ? `${preview.slice(0, 95).trimEnd()}…` : preview;
  return `Keep this AnimeGirly conversation going: "${clippedPreview}"`;
}
