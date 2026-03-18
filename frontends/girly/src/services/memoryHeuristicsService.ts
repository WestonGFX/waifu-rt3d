import { type ChatMessage } from '../types/index.ts';
import { type MemoryRecord, type ThreadSummaryRecord } from '../types/companion.ts';

const SUMMARY_MIN_MESSAGES = 12;
const SUMMARY_RECENT_WINDOW = 10;

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function splitSentences(value: string): string[] {
  return normalizeText(value)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => normalizeText(value)).filter(Boolean)));
}

function getUserMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((message) => message.role === 'user' && message.content.trim().length > 0);
}

function extractPreferenceFacts(messages: ChatMessage[]): Array<Pick<MemoryRecord, 'kind' | 'text' | 'sourceMessageIds' | 'salience' | 'confidence'>> {
  const results: Array<Pick<MemoryRecord, 'kind' | 'text' | 'sourceMessageIds' | 'salience' | 'confidence'>> = [];

  for (const message of getUserMessages(messages)) {
    const content = normalizeText(message.content);
    const lower = content.toLowerCase();

    const favoriteMatch = lower.match(/my favorite ([a-z\s]+?) is ([^.?!]+)/i);
    if (favoriteMatch) {
      results.push({
        kind: 'preference',
        text: `Favorite ${favoriteMatch[1].trim()}: ${favoriteMatch[2].trim()}`,
        sourceMessageIds: [message.id],
        salience: 0.8,
        confidence: 0.78,
      });
    }

    const likeMatch = lower.match(/\bi (?:really )?(?:like|love|enjoy|prefer) ([^.?!]+)/i);
    if (likeMatch) {
      results.push({
        kind: 'preference',
        text: `Enjoys ${likeMatch[1].trim()}`,
        sourceMessageIds: [message.id],
        salience: 0.72,
        confidence: 0.74,
      });
    }

    const dislikeMatch = lower.match(/\bi (?:(?:do not|don't) like|hate|dislike) ([^.?!]+)/i);
    if (dislikeMatch) {
      results.push({
        kind: 'boundary',
        text: `Dislikes ${dislikeMatch[1].trim()}`,
        sourceMessageIds: [message.id],
        salience: 0.75,
        confidence: 0.76,
      });
    }

    const callMeMatch = content.match(/\bcall me ([^.?!]+)/i);
    if (callMeMatch) {
      results.push({
        kind: 'relationship',
        text: `Preferred nickname: ${callMeMatch[1].trim()}`,
        sourceMessageIds: [message.id],
        salience: 0.86,
        confidence: 0.88,
      });
    }

    const rememberMatch = content.match(/\bremember (?:that )?([^.?!]+)/i);
    if (rememberMatch) {
      results.push({
        kind: 'callback',
        text: `Remember to callback to: ${rememberMatch[1].trim()}`,
        sourceMessageIds: [message.id],
        salience: 0.83,
        confidence: 0.77,
      });
    }

    const identityMatch = content.match(/\b(?:i am|i'm) ([^.?!]{3,80})/i);
    if (identityMatch) {
      results.push({
        kind: 'fact',
        text: `Identity detail: ${identityMatch[1].trim()}`,
        sourceMessageIds: [message.id],
        salience: 0.64,
        confidence: 0.7,
      });
    }

    const workMatch = content.match(/\b(?:i work as|i'm a|i am a) ([^.?!]{3,80})/i);
    if (workMatch) {
      results.push({
        kind: 'fact',
        text: `Life detail: ${workMatch[1].trim()}`,
        sourceMessageIds: [message.id],
        salience: 0.68,
        confidence: 0.72,
      });
    }
  }

  for (const message of messages.filter((entry) => entry.role === 'assistant' && entry.content.trim().length > 0)) {
    const content = normalizeText(message.content);

    const promiseMatch = content.match(/\b(?:i(?:'|’)ll remember|i won't forget|i’ll keep that in mind|i will remember) ([^.?!]+)/i);
    if (promiseMatch) {
      results.push({
        kind: 'callback',
        text: `Assistant commitment: ${promiseMatch[1].trim()}`,
        sourceMessageIds: [message.id],
        salience: 0.74,
        confidence: 0.72,
      });
    }
  }

  return results;
}

export function buildThreadSummaryRecord(
  threadId: string,
  messages: ChatMessage[],
  summaryVersion: number,
  now = Date.now(),
): ThreadSummaryRecord | null {
  if (messages.length < SUMMARY_MIN_MESSAGES) return null;

  const recentWindow = Math.min(
    SUMMARY_RECENT_WINDOW,
    Math.max(4, Math.floor(messages.length * 0.4)),
  );
  const olderMessages = messages.slice(0, Math.max(0, messages.length - recentWindow));
  if (olderMessages.length < 4) return null;

  const transcriptHighlights = olderMessages
    .slice(-8)
    .flatMap((message) => splitSentences(message.content).slice(0, 1))
    .slice(0, 6);

  const notablePreferences = uniqueStrings(
    extractPreferenceFacts(olderMessages)
      .filter((record) => record.kind === 'preference' || record.kind === 'boundary')
      .map((record) => record.text),
  ).slice(0, 5);

  const unresolvedTopics = uniqueStrings(
    messages
      .filter((message) => message.role === 'user' && message.content.includes('?'))
      .map((message) => splitSentences(message.content).find((sentence) => sentence.includes('?')) ?? message.content),
  ).slice(0, 4);

  const assistantMessages = olderMessages.filter((message) => message.role === 'assistant');
  const relationshipState = assistantMessages.length > 0
    ? 'Warm ongoing conversation with an established companion rhythm.'
    : 'Early-stage conversation with little assistant context.';

  return {
    threadId,
    summaryVersion,
    summaryText: transcriptHighlights.length > 0
      ? transcriptHighlights.join(' ')
      : 'Conversation history is stored, but there is not enough distinct content to summarize yet.',
    relationshipState,
    unresolvedTopics,
    notablePreferences,
    updatedAt: now,
  };
}

export function buildMemoryRecords(
  personaId: string,
  threadId: string,
  messages: ChatMessage[],
  existingRecords: MemoryRecord[],
  now = Date.now(),
): MemoryRecord[] {
  const existingTexts = new Set(existingRecords.map((record) => record.text.toLowerCase()));
  const extracted = extractPreferenceFacts(messages);

  return extracted
    .filter((record) => !existingTexts.has(record.text.toLowerCase()))
    .map((record, index) => ({
      id: `memory-${threadId}-${now}-${index}`,
      personaId,
      threadId,
      kind: record.kind,
      text: record.text,
      salience: record.salience,
      confidence: record.confidence,
      createdAt: now + index,
      sourceMessageIds: record.sourceMessageIds,
    }));
}

function getTokenSet(value: string): Set<string> {
  return new Set(
    normalizeText(value)
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter((token) => token.length > 2),
  );
}

/**
 * Enhanced memory retrieval using semantic embeddings when available.
 *
 * Falls back to token-overlap scoring when embeddings are not present.
 * Uses cosine similarity weighted by salience and recency decay for
 * embedding-based retrieval.
 *
 * @param memoryRecords - All candidate memory records.
 * @param messages - Recent conversation messages.
 * @param queryEmbedding - Embedding of the current query (null if unavailable).
 * @param maxItems - Maximum memories to return.
 * @returns Top-scoring memories.
 */
export function selectRetrievedMemoriesSemantic(
  memoryRecords: MemoryRecord[],
  messages: ChatMessage[],
  queryEmbedding: number[] | null,
  maxItems = 5,
): MemoryRecord[] {
  if (memoryRecords.length === 0) return [];

  // If we have a query embedding and some memories have embeddings, use semantic scoring
  const memoriesWithEmbeddings = memoryRecords.filter((r) => r.embedding && r.embedding.length > 0);

  if (queryEmbedding && memoriesWithEmbeddings.length > 0) {
    const scored = memoriesWithEmbeddings.map((record) => {
      const similarity = cosineSimInline(queryEmbedding, record.embedding!);
      const recency = computeRecencyInline(record.createdAt);
      const score = (similarity * 2) + record.salience + (recency * 0.5);
      return { record, score };
    });

    // Also score memories without embeddings using token overlap (as fallback)
    const memoriesWithoutEmbeddings = memoryRecords.filter((r) => !r.embedding || r.embedding.length === 0);
    const latestUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    const queryTokens = latestUserMessage ? getTokenSet(latestUserMessage.content) : new Set<string>();

    for (const record of memoriesWithoutEmbeddings) {
      const memoryTokens = getTokenSet(record.text);
      let overlap = 0;
      for (const token of memoryTokens) {
        if (queryTokens.has(token)) overlap += 1;
      }
      scored.push({ record, score: overlap * 2 + record.salience + record.confidence * 0.5 });
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, maxItems)
      .map((item) => item.record);
  }

  // Fallback: token-overlap retrieval
  return selectRetrievedMemories(memoryRecords, messages, maxItems);
}

/** Inline cosine similarity for embedding vectors. */
function cosineSimInline(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/** Inline recency decay: 1.0 for fresh, decays over months. */
function computeRecencyInline(createdAt: number): number {
  const ageMs = Date.now() - createdAt;
  const ageHours = ageMs / (1000 * 60 * 60);
  if (ageHours < 1) return 1.0;
  if (ageHours < 24) return 0.8;
  if (ageHours < 168) return 0.5; // 1 week
  if (ageHours < 720) return 0.2; // 1 month
  return 0.05;
}

export function selectRetrievedMemories(
  memoryRecords: MemoryRecord[],
  messages: ChatMessage[],
  maxItems = 3,
): MemoryRecord[] {
  if (memoryRecords.length === 0) return [];

  const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user');
  if (!latestUserMessage) {
    return memoryRecords
      .slice()
      .sort((left, right) => (right.salience - left.salience) || (right.createdAt - left.createdAt))
      .slice(0, maxItems);
  }

  const queryTokens = getTokenSet(latestUserMessage.content);
  return memoryRecords
    .slice()
    .map((record) => {
      const memoryTokens = getTokenSet(record.text);
      let overlap = 0;
      for (const token of memoryTokens) {
        if (queryTokens.has(token)) overlap += 1;
      }
      return {
        record,
        score: overlap * 2 + record.salience + record.confidence * 0.5,
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, maxItems)
    .map((item) => item.record);
}
