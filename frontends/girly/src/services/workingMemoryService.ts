/**
 * @fileoverview Working memory buffer service for AnimeGirly's Advanced Memory system.
 *
 * Working memory is a short-term fact buffer that holds information extracted
 * from the CURRENT conversation that has not yet been committed to long-term
 * memory. It prevents the companion from "forgetting" something mentioned only
 * a few messages ago by injecting the freshest facts directly into the prompt
 * on every turn.
 *
 * All functions are pure — no React dependency, no side effects.
 */

import { type ChatMessage } from '../types/index.ts';
import { type MemoryRecord } from '../types/companion.ts';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * A single extracted fact from the current conversation window.
 * Facts are ephemeral: they live only in the current session and are
 * discarded once committed to a MemoryRecord or the conversation ends.
 */
export interface WorkingMemoryFact {
  /** Human-readable description of the extracted fact. */
  text: string;
  /** ID of the ChatMessage this fact was extracted from. */
  sourceMessageId: string;
  /** Unix timestamp (Date.now()) at which this fact was extracted. */
  extractedAt: number;
  /**
   * Semantic category used when formatting the injection block.
   * - 'name'       — People the user mentioned by name (self, family, friends).
   * - 'preference' — Likes, dislikes, or favourites.
   * - 'fact'       — Biographical / situational facts (job, age, location).
   * - 'emotion'    — Current emotional state expressed by the user.
   * - 'plan'       — Upcoming intentions or scheduled events.
   * - 'reference'  — Callbacks to previously mentioned topics.
   */
  category: 'name' | 'preference' | 'fact' | 'emotion' | 'plan' | 'reference';
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Maximum messages scanned for fact extraction in a single call. */
const SCAN_WINDOW = 10;

/** Hard cap on the number of facts returned. */
const MAX_FACTS = 15;

/**
 * Normalises whitespace in a content string.
 *
 * @param value - Raw message content.
 * @returns Content with leading/trailing whitespace stripped and internal runs
 *   collapsed to a single space.
 */
function normalise(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/**
 * Capitalises the first character of a string.
 *
 * @param value - Input string.
 * @returns String with its first character uppercased.
 */
function ucFirst(value: string): string {
  if (value.length === 0) return value;
  return value[0].toUpperCase() + value.slice(1);
}

// ─── Extraction helpers (one per category) ───────────────────────────────────

/**
 * Extracts name-category facts from a single message.
 *
 * Matches patterns such as:
 *   - "my name is Alex"
 *   - "call me Lexi"
 *   - "my sister Sarah" / "my friend Tom"
 *
 * @param content   - Normalised message content.
 * @param messageId - ID of the source message.
 * @param now       - Timestamp to stamp extracted facts with.
 * @returns Zero or more name facts.
 */
function extractNameFacts(
  content: string,
  messageId: string,
  now: number,
): WorkingMemoryFact[] {
  const facts: WorkingMemoryFact[] = [];
  const lower = content.toLowerCase();

  const selfNameMatch = lower.match(/\bmy name is ([a-z][a-z'\-\s]{0,30}?)(?:[.!?,]|$)/i);
  if (selfNameMatch) {
    facts.push({
      text: `User's name is ${ucFirst(selfNameMatch[1].trim())}`,
      sourceMessageId: messageId,
      extractedAt: now,
      category: 'name',
    });
  }

  const callMeMatch = content.match(/\bcall me ([A-Za-z][A-Za-z'\-\s]{0,30}?)(?:[.!?,]|$)/i);
  if (callMeMatch) {
    facts.push({
      text: `User prefers to be called ${ucFirst(callMeMatch[1].trim())}`,
      sourceMessageId: messageId,
      extractedAt: now,
      category: 'name',
    });
  }

  const relativeMatch = lower.match(/\bmy (sister|brother|friend|boyfriend|girlfriend|mom|dad|mother|father|wife|husband|partner)\s+([a-z][a-z'-]{1,20})/i);
  if (relativeMatch) {
    facts.push({
      text: `User's ${relativeMatch[1]} is called ${ucFirst(relativeMatch[2].trim())}`,
      sourceMessageId: messageId,
      extractedAt: now,
      category: 'name',
    });
  }

  return facts;
}

/**
 * Extracts preference-category facts from a single message.
 *
 * Matches patterns such as:
 *   - "I like hiking"
 *   - "I love sushi"
 *   - "I don't like crowds"
 *   - "my favorite movie is Spirited Away"
 *
 * @param content   - Normalised message content.
 * @param messageId - ID of the source message.
 * @param now       - Timestamp to stamp extracted facts with.
 * @returns Zero or more preference facts.
 */
function extractPreferenceFacts(
  content: string,
  messageId: string,
  now: number,
): WorkingMemoryFact[] {
  const facts: WorkingMemoryFact[] = [];
  const lower = content.toLowerCase();

  const likeMatch = lower.match(/\bi (?:really )?(?:like|love|enjoy|adore|prefer) ([^.?!]{2,60})/i);
  if (likeMatch) {
    facts.push({
      text: `User enjoys ${likeMatch[1].trim()}`,
      sourceMessageId: messageId,
      extractedAt: now,
      category: 'preference',
    });
  }

  const dislikeMatch = lower.match(/\bi (?:(?:do not|don't) like|hate|dislike|can't stand) ([^.?!]{2,60})/i);
  if (dislikeMatch) {
    facts.push({
      text: `User dislikes ${dislikeMatch[1].trim()}`,
      sourceMessageId: messageId,
      extractedAt: now,
      category: 'preference',
    });
  }

  const favoriteMatch = lower.match(/\bmy favou?rite ([a-z\s]{2,30}?) is ([^.?!]{2,60})/i);
  if (favoriteMatch) {
    facts.push({
      text: `User's favourite ${favoriteMatch[1].trim()} is ${favoriteMatch[2].trim()}`,
      sourceMessageId: messageId,
      extractedAt: now,
      category: 'preference',
    });
  }

  return facts;
}

/**
 * Extracts fact-category facts from a single message.
 *
 * Matches patterns such as:
 *   - "I am a software engineer"
 *   - "I live in Tokyo"
 *   - "I'm 24 years old"
 *
 * @param content   - Normalised message content.
 * @param messageId - ID of the source message.
 * @param now       - Timestamp to stamp extracted facts with.
 * @returns Zero or more biographical facts.
 */
function extractBioFacts(
  content: string,
  messageId: string,
  now: number,
): WorkingMemoryFact[] {
  const facts: WorkingMemoryFact[] = [];
  const lower = content.toLowerCase();

  const jobMatch = lower.match(/\bi (?:work as|am a|'m a) ([^.?!]{3,60})/i);
  if (jobMatch) {
    facts.push({
      text: `User is a ${jobMatch[1].trim()}`,
      sourceMessageId: messageId,
      extractedAt: now,
      category: 'fact',
    });
  }

  const locationMatch = lower.match(/\bi (?:live|am living|grew up) (?:in|near) ([^.?!]{2,50})/i);
  if (locationMatch) {
    facts.push({
      text: `User lives in ${locationMatch[1].trim()}`,
      sourceMessageId: messageId,
      extractedAt: now,
      category: 'fact',
    });
  }

  const ageMatch = lower.match(/\bi(?:'m| am) (\d{1,3}) years? old/i);
  if (ageMatch) {
    facts.push({
      text: `User is ${ageMatch[1]} years old`,
      sourceMessageId: messageId,
      extractedAt: now,
      category: 'fact',
    });
  }

  return facts;
}

/**
 * Extracts emotion-category facts from a single message.
 *
 * Matches patterns such as:
 *   - "I feel anxious"
 *   - "I'm feeling really happy today"
 *   - "that makes me nervous"
 *
 * @param content   - Normalised message content.
 * @param messageId - ID of the source message.
 * @param now       - Timestamp to stamp extracted facts with.
 * @returns Zero or more emotion facts.
 */
function extractEmotionFacts(
  content: string,
  messageId: string,
  now: number,
): WorkingMemoryFact[] {
  const facts: WorkingMemoryFact[] = [];
  const lower = content.toLowerCase();

  const feelMatch = lower.match(/\bi(?:'m| am)? feeling ([^.?!]{2,50})/i);
  if (feelMatch) {
    facts.push({
      text: `User is feeling ${feelMatch[1].trim()}`,
      sourceMessageId: messageId,
      extractedAt: now,
      category: 'emotion',
    });
  }

  const iFeelMatch = lower.match(/\bi feel ([^.?!]{2,50})/i);
  if (iFeelMatch) {
    facts.push({
      text: `User feels ${iFeelMatch[1].trim()}`,
      sourceMessageId: messageId,
      extractedAt: now,
      category: 'emotion',
    });
  }

  const makesMeMatch = lower.match(/\bthat (?:makes|made) me ([^.?!]{2,40})/i);
  if (makesMeMatch) {
    facts.push({
      text: `User expressed feeling ${makesMeMatch[1].trim()}`,
      sourceMessageId: messageId,
      extractedAt: now,
      category: 'emotion',
    });
  }

  return facts;
}

/**
 * Extracts plan-category facts from a single message.
 *
 * Matches patterns such as:
 *   - "I'm going to visit my parents"
 *   - "tomorrow I have a job interview"
 *   - "next week I'm starting a new project"
 *
 * @param content   - Normalised message content.
 * @param messageId - ID of the source message.
 * @param now       - Timestamp to stamp extracted facts with.
 * @returns Zero or more plan facts.
 */
function extractPlanFacts(
  content: string,
  messageId: string,
  now: number,
): WorkingMemoryFact[] {
  const facts: WorkingMemoryFact[] = [];
  const lower = content.toLowerCase();

  const goingToMatch = lower.match(/\bi(?:'m| am) (?:going to|planning to|about to) ([^.?!]{2,70})/i);
  if (goingToMatch) {
    facts.push({
      text: `User plans to ${goingToMatch[1].trim()}`,
      sourceMessageId: messageId,
      extractedAt: now,
      category: 'plan',
    });
  }

  const tomorrowMatch = lower.match(/\btomorrow (?:i )?([^.?!]{2,70})/i);
  if (tomorrowMatch) {
    facts.push({
      text: `Tomorrow: user ${tomorrowMatch[1].trim()}`,
      sourceMessageId: messageId,
      extractedAt: now,
      category: 'plan',
    });
  }

  const nextWeekMatch = lower.match(/\bnext (?:week|month|year) (?:i )?([^.?!]{2,70})/i);
  if (nextWeekMatch) {
    facts.push({
      text: `Upcoming: user ${nextWeekMatch[1].trim()}`,
      sourceMessageId: messageId,
      extractedAt: now,
      category: 'plan',
    });
  }

  return facts;
}

/**
 * Extracts reference-category facts from a single message.
 *
 * Matches patterns such as:
 *   - "she said that we should meet"
 *   - "that thing I mentioned earlier"
 *   - "he told me to check it out"
 *
 * @param content   - Normalised message content.
 * @param messageId - ID of the source message.
 * @param now       - Timestamp to stamp extracted facts with.
 * @returns Zero or more reference facts.
 */
function extractReferenceFacts(
  content: string,
  messageId: string,
  now: number,
): WorkingMemoryFact[] {
  const facts: WorkingMemoryFact[] = [];
  const lower = content.toLowerCase();

  const theyMatch = lower.match(/\b(?:she|he|they) (?:said|told me|mentioned) ([^.?!]{2,70})/i);
  if (theyMatch) {
    facts.push({
      text: `User referenced: "${theyMatch[1].trim()}"`,
      sourceMessageId: messageId,
      extractedAt: now,
      category: 'reference',
    });
  }

  const mentionedMatch = lower.match(/\bthat (?:thing|topic|issue|story) (?:i )?mentioned ([^.?!]{0,60})/i);
  if (mentionedMatch) {
    const suffix = mentionedMatch[1].trim();
    facts.push({
      text: suffix.length > 0
        ? `User referred back to something previously mentioned: ${suffix}`
        : 'User referenced a previously mentioned topic',
      sourceMessageId: messageId,
      extractedAt: now,
      category: 'reference',
    });
  }

  return facts;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Scans the most recent messages in a conversation for extractable short-term
 * facts, returning a deduplicated list capped at {@link MAX_FACTS} items.
 *
 * Only user messages are scanned — assistant messages do not contribute facts
 * because the companion should recall what the *user* said, not what it said
 * itself.  The scan window is the last {@link SCAN_WINDOW} messages.
 *
 * @param messages - Full ordered message history for the current thread.
 * @returns Array of extracted working-memory facts, newest first, max 15 items.
 *
 * @example
 * const facts = extractWorkingMemoryFacts(messages);
 * // [{ text: "User's name is Alex", category: "name", ... }, ...]
 */
export function extractWorkingMemoryFacts(messages: ChatMessage[]): WorkingMemoryFact[] {
  const window = messages.slice(-SCAN_WINDOW);
  const now = Date.now();
  const seenTexts = new Set<string>();
  const facts: WorkingMemoryFact[] = [];

  for (const message of window) {
    if (message.role !== 'user') continue;
    const content = normalise(message.content);
    if (content.length === 0) continue;

    const candidates: WorkingMemoryFact[] = [
      ...extractNameFacts(content, message.id, now),
      ...extractPreferenceFacts(content, message.id, now),
      ...extractBioFacts(content, message.id, now),
      ...extractEmotionFacts(content, message.id, now),
      ...extractPlanFacts(content, message.id, now),
      ...extractReferenceFacts(content, message.id, now),
    ];

    for (const fact of candidates) {
      const key = fact.text.toLowerCase();
      if (!seenTexts.has(key)) {
        seenTexts.add(key);
        facts.push(fact);
      }
    }
  }

  return facts.slice(0, MAX_FACTS);
}

/**
 * Formats an array of working-memory facts into a compact prompt-injection
 * block that the LLM can read naturally.
 *
 * The block is designed to sit between the persona prompt and the message
 * history so the companion internalises these facts without treating them as
 * explicit dialogue.
 *
 * @param facts - Working-memory facts produced by {@link extractWorkingMemoryFacts}.
 * @returns Formatted multi-line string, or an empty string when facts is empty.
 *
 * @example
 * const block = buildWorkingMemoryBlock(facts);
 * // "[Working Memory — facts from this conversation, use naturally]\n- Name: ...\n- Preference: ..."
 */
export function buildWorkingMemoryBlock(facts: WorkingMemoryFact[]): string {
  if (facts.length === 0) return '';

  const CATEGORY_LABELS: Record<WorkingMemoryFact['category'], string> = {
    name: 'Name',
    preference: 'Preference',
    fact: 'Fact',
    emotion: 'Emotion',
    plan: 'Plan',
    reference: 'Reference',
  };

  const lines = facts.map((fact) => `- ${CATEGORY_LABELS[fact.category]}: ${fact.text}`);

  return [
    '[Working Memory — facts from this conversation, use naturally]',
    ...lines,
  ].join('\n');
}

/**
 * Removes working-memory facts whose content is already captured in long-term
 * memory, preventing redundant or contradictory injection.
 *
 * Similarity is determined by token-level overlap: a working fact is
 * considered a duplicate if more than half of its significant tokens are
 * present in any long-term memory record's text.
 *
 * @param workingFacts    - Facts freshly extracted from the current conversation.
 * @param longTermMemories - Persisted MemoryRecord array for the current persona.
 * @returns Subset of workingFacts that are NOT already covered by long-term memory.
 *
 * @example
 * const deduped = deduplicateWithLongTerm(workingFacts, memoryRecords);
 * // Only facts absent from long-term memory are returned.
 */
export function deduplicateWithLongTerm(
  workingFacts: WorkingMemoryFact[],
  longTermMemories: MemoryRecord[],
): WorkingMemoryFact[] {
  if (longTermMemories.length === 0) return workingFacts;

  /**
   * Builds a token set from a string by splitting on non-alphanumeric chars
   * and discarding short stop-word-like tokens.
   */
  function tokenSet(value: string): Set<string> {
    return new Set(
      value
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .filter((token) => token.length > 2),
    );
  }

  const longTermTokenSets = longTermMemories.map((record) => tokenSet(record.text));

  return workingFacts.filter((fact) => {
    const factTokens = tokenSet(fact.text);
    if (factTokens.size === 0) return false;

    for (const ltTokens of longTermTokenSets) {
      let overlap = 0;
      for (const token of factTokens) {
        if (ltTokens.has(token)) overlap += 1;
      }
      // Treat as duplicate if > 50 % of the fact's tokens are present in a
      // long-term record — loose enough to catch paraphrases, tight enough to
      // allow genuinely new facts through.
      if (overlap / factTokens.size > 0.5) return false;
    }

    return true;
  });
}
