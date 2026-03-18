/**
 * @fileoverview Knowledge boundary service for AnimeGirly's companion system.
 *
 * Tracks what the companion knows vs. does not know about the user, keyed
 * against a predefined taxonomy of personal topics.  This prevents the
 * companion from hallucinating biographical details and encourages natural
 * follow-up questions when the user hasn't shared certain information yet.
 *
 * All functions are pure — no React dependency, no side effects.
 */

import { type ChatMessage } from '../types/index.ts';
import { type KnowledgeBoundary } from '../types/companion.ts';

// ─── Topic taxonomy ──────────────────────────────────────────────────────────

/**
 * Canonical set of personal topics the companion tracks across all
 * conversations.  Values are the normalised topic labels stored on
 * {@link KnowledgeBoundary.topic}.
 */
export const KNOWLEDGE_TOPICS = [
  'user_name',
  'user_age',
  'user_location',
  'user_occupation',
  'user_hobbies',
  'user_family',
  'user_pets',
  'user_relationship_status',
  'user_birthday',
  'user_favorite_food',
  'user_favorite_music',
  'user_favorite_anime',
  'user_daily_routine',
  'user_goals',
] as const;

/** Union of all recognised topic labels. */
export type KnowledgeTopic = (typeof KNOWLEDGE_TOPICS)[number];

// ─── Internal types ──────────────────────────────────────────────────────────

/**
 * Classification of how confidently a regex match covers a topic.
 * - 'known'          — clear, unambiguous statement.
 * - 'partially-known'— partial mention with limited detail.
 */
type MatchConfidence = 'known' | 'partially-known';

/**
 * Result produced by a single topic detector.
 */
interface TopicMatch {
  topic: KnowledgeTopic;
  confidence: MatchConfidence;
  /** Extracted snippet used as the {@link KnowledgeBoundary.evidence} value. */
  evidence: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Normalises whitespace in a content string.
 *
 * @param value - Raw message content.
 * @returns Trimmed string with internal whitespace collapsed to one space.
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

// ─── Per-topic detectors ──────────────────────────────────────────────────────

/**
 * Attempts to extract a `user_name` match from normalised content.
 *
 * Recognises patterns:
 * - "my name is Alex"
 * - "call me Lexi"
 * - "I'm Alex" (only when followed by punctuation or end-of-string, to
 *   avoid false positives on "I'm tired" etc.)
 *
 * @param content - Normalised, lowercased message content.
 * @returns A {@link TopicMatch} or `null` when no pattern fires.
 */
function detectUserName(content: string): TopicMatch | null {
  const namePattern = /\bmy name is ([a-z][a-z'\-]{1,30})/i;
  const callMePattern = /\bcall me ([a-z][a-z'\-]{1,30})/i;
  // "I'm X" only when X is a plausible one/two-word name not followed by more words
  const iAmPattern = /\bi'?m ([A-Z][a-z'\-]{1,20})(?:[.!?,]|$)/;

  let match = content.match(namePattern) ?? content.match(callMePattern);
  if (match) {
    return {
      topic: 'user_name',
      confidence: 'known',
      evidence: `User's name is ${ucFirst(match[1].trim())}`,
    };
  }

  // iAmPattern operates on raw (non-lowercased) content to check capitalisation
  match = content.match(iAmPattern);
  if (match) {
    return {
      topic: 'user_name',
      confidence: 'partially-known',
      evidence: `User may go by ${match[1].trim()}`,
    };
  }

  return null;
}

/**
 * Attempts to extract a `user_age` match from normalised content.
 *
 * Recognises patterns:
 * - "I'm 24 years old"
 * - "I'm in my 20s"
 *
 * @param content - Normalised message content.
 * @returns A {@link TopicMatch} or `null` when no pattern fires.
 */
function detectUserAge(content: string): TopicMatch | null {
  const exactAge = /\bi'?m (\d{1,3}) years? old/i;
  const roughAge = /\bi'?m in my (\d{1,3})s\b/i;

  let match = content.match(exactAge);
  if (match) {
    return {
      topic: 'user_age',
      confidence: 'known',
      evidence: `User is ${match[1]} years old`,
    };
  }

  match = content.match(roughAge);
  if (match) {
    return {
      topic: 'user_age',
      confidence: 'partially-known',
      evidence: `User is in their ${match[1]}s`,
    };
  }

  return null;
}

/**
 * Attempts to extract a `user_location` match from normalised content.
 *
 * Recognises patterns:
 * - "I live in Tokyo"
 * - "I'm from Osaka"
 *
 * @param content - Normalised message content.
 * @returns A {@link TopicMatch} or `null` when no pattern fires.
 */
function detectUserLocation(content: string): TopicMatch | null {
  const liveIn = /\bi (?:live|am living|grew up) (?:in|near) ([^.?!,]{2,50})/i;
  const fromPattern = /\bi'?m from ([^.?!,]{2,50})/i;

  let match = content.match(liveIn);
  if (match) {
    return {
      topic: 'user_location',
      confidence: 'known',
      evidence: `User lives in ${normalise(match[1])}`,
    };
  }

  match = content.match(fromPattern);
  if (match) {
    return {
      topic: 'user_location',
      confidence: 'known',
      evidence: `User is from ${normalise(match[1])}`,
    };
  }

  return null;
}

/**
 * Attempts to extract a `user_occupation` match from normalised content.
 *
 * Recognises patterns:
 * - "I work as a nurse"
 * - "I'm a software engineer"
 *
 * @param content - Normalised message content.
 * @returns A {@link TopicMatch} or `null` when no pattern fires.
 */
function detectUserOccupation(content: string): TopicMatch | null {
  // "I work as X" — high confidence
  const workAs = /\bi work(?:ed)? as (?:a |an )?([^.?!,]{3,60})/i;
  // "I'm a X" followed by a job-ish noun — moderate confidence
  const iAmA = /\bi'?m (?:a |an )([\w\s]{3,40}?)(?:\s*[.!?,]|$)/i;

  const JOB_KEYWORDS =
    /\b(?:engineer|developer|designer|doctor|nurse|teacher|chef|manager|analyst|artist|writer|lawyer|architect|scientist|professor|consultant|therapist|accountant|student|intern|freelancer)\b/i;

  let match = content.match(workAs);
  if (match) {
    return {
      topic: 'user_occupation',
      confidence: 'known',
      evidence: `User works as ${match[1].trim()}`,
    };
  }

  match = content.match(iAmA);
  if (match && JOB_KEYWORDS.test(match[1])) {
    return {
      topic: 'user_occupation',
      confidence: 'known',
      evidence: `User is a ${match[1].trim()}`,
    };
  }

  return null;
}

/**
 * Attempts to extract a `user_hobbies` match from normalised content.
 *
 * Recognises patterns:
 * - "I like to draw"
 * - "my hobby is gaming"
 *
 * @param content - Normalised message content.
 * @returns A {@link TopicMatch} or `null` when no pattern fires.
 */
function detectUserHobbies(content: string): TopicMatch | null {
  const likeToMatch = /\bi (?:like|love|enjoy) to ([^.?!,]{2,60})/i;
  const hobbyIsMatch = /\bmy hobbies? (?:is|are|include) ([^.?!,]{2,60})/i;

  let match = content.match(likeToMatch);
  if (match) {
    return {
      topic: 'user_hobbies',
      confidence: 'known',
      evidence: `User enjoys ${match[1].trim()}`,
    };
  }

  match = content.match(hobbyIsMatch);
  if (match) {
    return {
      topic: 'user_hobbies',
      confidence: 'known',
      evidence: `User's hobby is ${match[1].trim()}`,
    };
  }

  return null;
}

/**
 * Attempts to extract a `user_family` match from normalised content.
 *
 * Recognises patterns:
 * - "my sister Sarah"
 * - "my dad works in finance"
 * - "I have a brother"
 *
 * @param content - Normalised message content.
 * @returns A {@link TopicMatch} or `null` when no pattern fires.
 */
function detectUserFamily(content: string): TopicMatch | null {
  const FAMILY_TERMS =
    'sister|brother|mom|dad|mother|father|grandma|grandpa|grandmother|grandfather|aunt|uncle|cousin|son|daughter';
  const namedRelative = new RegExp(
    `\\bmy (${FAMILY_TERMS})\\s+([A-Z][a-z'\\-]{1,20})`,
    'i',
  );
  const mentionedRelative = new RegExp(
    `\\bmy (${FAMILY_TERMS})\\b`,
    'i',
  );

  let match = content.match(namedRelative);
  if (match) {
    return {
      topic: 'user_family',
      confidence: 'known',
      evidence: `User's ${match[1]} is ${ucFirst(match[2])}`,
    };
  }

  match = content.match(mentionedRelative);
  if (match) {
    return {
      topic: 'user_family',
      confidence: 'partially-known',
      evidence: `User has a ${match[1]}`,
    };
  }

  return null;
}

/**
 * Attempts to extract a `user_pets` match from normalised content.
 *
 * Recognises patterns:
 * - "my cat Mochi"
 * - "I have a dog"
 *
 * @param content - Normalised message content.
 * @returns A {@link TopicMatch} or `null` when no pattern fires.
 */
function detectUserPets(content: string): TopicMatch | null {
  const PET_TERMS = 'cat|dog|rabbit|hamster|bunny|bird|fish|turtle|snake|lizard|pet';
  const namedPet = new RegExp(
    `\\bmy (${PET_TERMS})\\s+([A-Z][a-z'\\-]{1,20})`,
    'i',
  );
  const hasPet = new RegExp(
    `\\bi have (?:a |an )?(${PET_TERMS})\\b`,
    'i',
  );

  let match = content.match(namedPet);
  if (match) {
    return {
      topic: 'user_pets',
      confidence: 'known',
      evidence: `User has a ${match[1]} named ${ucFirst(match[2])}`,
    };
  }

  match = content.match(hasPet);
  if (match) {
    return {
      topic: 'user_pets',
      confidence: 'partially-known',
      evidence: `User has a ${match[1]}`,
    };
  }

  return null;
}

/**
 * Attempts to extract a `user_relationship_status` match from normalised content.
 *
 * Recognises patterns:
 * - "my boyfriend / girlfriend / partner"
 * - "I'm single"
 * - "I'm married"
 *
 * @param content - Normalised message content.
 * @returns A {@link TopicMatch} or `null` when no pattern fires.
 */
function detectRelationshipStatus(content: string): TopicMatch | null {
  const partnerMatch = /\bmy (boyfriend|girlfriend|partner|husband|wife|fiance[e]?)\b/i;
  const singleMatch = /\bi'?m (single|married|divorced|engaged|in a relationship)\b/i;

  let match = content.match(partnerMatch);
  if (match) {
    return {
      topic: 'user_relationship_status',
      confidence: 'known',
      evidence: `User has a ${match[1]}`,
    };
  }

  match = content.match(singleMatch);
  if (match) {
    return {
      topic: 'user_relationship_status',
      confidence: 'known',
      evidence: `User is ${match[1]}`,
    };
  }

  return null;
}

/**
 * Attempts to extract a `user_birthday` match from normalised content.
 *
 * Recognises patterns:
 * - "my birthday is June 12"
 * - "born on the 3rd of March"
 *
 * @param content - Normalised message content.
 * @returns A {@link TopicMatch} or `null` when no pattern fires.
 */
function detectUserBirthday(content: string): TopicMatch | null {
  const birthdayIs =
    /\bmy birthday is ([^.?!,]{3,40})/i;
  const bornOn =
    /\bi (?:was )?born on ([^.?!,]{3,40})/i;

  let match = content.match(birthdayIs);
  if (match) {
    return {
      topic: 'user_birthday',
      confidence: 'known',
      evidence: `User's birthday is ${normalise(match[1])}`,
    };
  }

  match = content.match(bornOn);
  if (match) {
    return {
      topic: 'user_birthday',
      confidence: 'known',
      evidence: `User was born on ${normalise(match[1])}`,
    };
  }

  return null;
}

/**
 * Attempts to extract favourite food, music, or anime matches from normalised
 * content, covering `user_favorite_food`, `user_favorite_music`, and
 * `user_favorite_anime`.
 *
 * Recognises patterns:
 * - "my favorite food is ramen"
 * - "my favourite anime is Attack on Titan"
 *
 * @param content - Normalised message content.
 * @returns Zero or more {@link TopicMatch} objects (one per favourite found).
 */
function detectFavorites(content: string): TopicMatch[] {
  const matches: TopicMatch[] = [];

  const FAVORITE_MAP: Array<{
    keywords: string[];
    topic: KnowledgeTopic;
    label: string;
  }> = [
    { keywords: ['food', 'dish', 'meal', 'snack', 'drink', 'cuisine'], topic: 'user_favorite_food', label: 'food' },
    { keywords: ['music', 'song', 'band', 'artist', 'genre', 'album'], topic: 'user_favorite_music', label: 'music' },
    { keywords: ['anime', 'manga', 'show', 'series'], topic: 'user_favorite_anime', label: 'anime' },
  ];

  for (const entry of FAVORITE_MAP) {
    const keywordsPattern = entry.keywords.join('|');
    const pattern = new RegExp(
      `\\bmy favou?rite (${keywordsPattern})[^.?!]{0,20}? is ([^.?!,]{2,60})`,
      'i',
    );
    const m = content.match(pattern);
    if (m) {
      matches.push({
        topic: entry.topic,
        confidence: 'known',
        evidence: `User's favourite ${entry.label} is ${normalise(m[2])}`,
      });
    }
  }

  return matches;
}

/**
 * Attempts to extract a `user_daily_routine` match from normalised content.
 *
 * Recognises patterns:
 * - "I usually wake up at 7"
 * - "every morning I go for a run"
 *
 * @param content - Normalised message content.
 * @returns A {@link TopicMatch} or `null` when no pattern fires.
 */
function detectDailyRoutine(content: string): TopicMatch | null {
  const usuallyMatch = /\bi usually ([^.?!,]{3,70})/i;
  const everyMorningMatch = /\bevery (?:morning|evening|night|day) i ([^.?!,]{3,70})/i;

  let match = content.match(usuallyMatch);
  if (match) {
    return {
      topic: 'user_daily_routine',
      confidence: 'partially-known',
      evidence: `User usually ${match[1].trim()}`,
    };
  }

  match = content.match(everyMorningMatch);
  if (match) {
    return {
      topic: 'user_daily_routine',
      confidence: 'partially-known',
      evidence: `Part of user's routine: ${match[1].trim()}`,
    };
  }

  return null;
}

/**
 * Attempts to extract a `user_goals` match from normalised content.
 *
 * Recognises patterns:
 * - "I want to become a vet"
 * - "my dream is to travel Japan"
 * - "I'm working toward getting my degree"
 *
 * @param content - Normalised message content.
 * @returns A {@link TopicMatch} or `null` when no pattern fires.
 */
function detectUserGoals(content: string): TopicMatch | null {
  const wantToMatch = /\bi want to ([^.?!,]{3,70})/i;
  const dreamMatch = /\bmy dream is (?:to )?([^.?!,]{3,70})/i;
  const workingTowardMatch = /\bi'?m working (?:toward|towards|on) ([^.?!,]{3,70})/i;

  let match = content.match(wantToMatch);
  if (match) {
    return {
      topic: 'user_goals',
      confidence: 'partially-known',
      evidence: `User wants to ${match[1].trim()}`,
    };
  }

  match = content.match(dreamMatch);
  if (match) {
    return {
      topic: 'user_goals',
      confidence: 'known',
      evidence: `User's dream is to ${match[1].trim()}`,
    };
  }

  match = content.match(workingTowardMatch);
  if (match) {
    return {
      topic: 'user_goals',
      confidence: 'partially-known',
      evidence: `User is working toward ${match[1].trim()}`,
    };
  }

  return null;
}

/**
 * Runs all topic detectors against a single normalised message content string.
 *
 * @param content - Normalised content of a single user message.
 * @returns All {@link TopicMatch} objects produced by any detector.
 */
function runAllDetectors(content: string): TopicMatch[] {
  const results: TopicMatch[] = [];

  const singleDetectors: Array<(c: string) => TopicMatch | null> = [
    detectUserName,
    detectUserAge,
    detectUserLocation,
    detectUserOccupation,
    detectUserHobbies,
    detectUserFamily,
    detectUserPets,
    detectRelationshipStatus,
    detectUserBirthday,
    detectDailyRoutine,
    detectUserGoals,
  ];

  for (const detector of singleDetectors) {
    const result = detector(content);
    if (result !== null) results.push(result);
  }

  // Multi-result detectors
  results.push(...detectFavorites(content));

  return results;
}

// ─── Human-readable topic labels ─────────────────────────────────────────────

/**
 * Maps each {@link KnowledgeTopic} to a prose label used in the prompt block.
 */
const TOPIC_LABELS: Record<KnowledgeTopic, string> = {
  user_name: 'their name',
  user_age: 'their age',
  user_location: 'where they live',
  user_occupation: 'what they do for work',
  user_hobbies: 'their hobbies',
  user_family: 'their family',
  user_pets: 'whether they have pets',
  user_relationship_status: 'their relationship status',
  user_birthday: 'their birthday',
  user_favorite_food: 'their favourite food',
  user_favorite_music: 'their favourite music',
  user_favorite_anime: 'their favourite anime',
  user_daily_routine: 'their daily routine',
  user_goals: 'their goals and dreams',
};

/** Maximum number of unknown topics shown in the prompt block. */
const MAX_UNKNOWNS_IN_BLOCK = 4;

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Scans user messages for mentions of predefined personal topics and returns
 * new or updated {@link KnowledgeBoundary} records.
 *
 * Only records that have **changed** relative to `existingBoundaries` are
 * returned — callers should merge the result into their boundary store.  If a
 * topic was previously `'unknown'` and is now detected, its status becomes
 * `'known'` or `'partially-known'`.  A `'partially-known'` boundary that
 * gains a higher-confidence match is upgraded to `'known'`.
 *
 * @param messages           - Full ordered message history for the current thread.
 * @param existingBoundaries - Boundaries already persisted for the persona.
 * @param personaId          - ID of the persona these boundaries belong to.
 * @returns Array of new or updated {@link KnowledgeBoundary} records only.
 *
 * @example
 * const updates = scanForKnowledgeUpdates(messages, existing, 'persona-1');
 * // [{ id: 'persona-1:user_name', topic: 'user_name', status: 'known', evidence: "User's name is Alex", ... }]
 */
export function scanForKnowledgeUpdates(
  messages: ChatMessage[],
  existingBoundaries: KnowledgeBoundary[],
  personaId: string,
): KnowledgeBoundary[] {
  // Index existing boundaries by topic for O(1) lookup
  const existingByTopic = new Map<string, KnowledgeBoundary>(
    existingBoundaries.map((b) => [b.topic, b]),
  );

  // Collect all matches across all user messages, newest wins per topic
  // so we iterate chronologically and allow later messages to overwrite earlier
  const bestMatchByTopic = new Map<string, TopicMatch>();

  for (const message of messages) {
    if (message.role !== 'user') continue;
    const content = normalise(message.content);
    if (content.length === 0) continue;

    const matches = runAllDetectors(content);

    for (const match of matches) {
      const existing = bestMatchByTopic.get(match.topic);
      // A 'known' match always beats 'partially-known'
      if (!existing || match.confidence === 'known') {
        bestMatchByTopic.set(match.topic, match);
      }
    }
  }

  const now = Date.now();
  const updates: KnowledgeBoundary[] = [];

  for (const [topic, match] of bestMatchByTopic) {
    const existing = existingByTopic.get(topic);

    // Determine whether this represents a genuine state change
    const newStatus = match.confidence;

    if (existing) {
      // Already known — no downgrade, skip
      if (existing.status === 'known') continue;
      // Already at same status with same evidence — no change
      if (existing.status === newStatus && existing.evidence === match.evidence) continue;
    }

    updates.push({
      id: `${personaId}:${topic}`,
      personaId,
      topic,
      status: newStatus,
      evidence: match.evidence,
      updatedAt: now,
    });
  }

  return updates;
}

/**
 * Formats the current knowledge boundary state into a compact prompt-injection
 * block the LLM can read naturally.
 *
 * Known facts are listed in full.  Unknown topics are listed as conversational
 * hints, capped at {@link MAX_UNKNOWNS_IN_BLOCK} items to avoid bloating the
 * context window.  Returns an empty string when `boundaries` is empty.
 *
 * @param boundaries - All {@link KnowledgeBoundary} records for the current persona.
 * @returns Formatted multi-line string ready for prompt injection, or `''`.
 *
 * @example
 * const block = buildKnowledgeBoundaryBlock(boundaries);
 * // "[Knowledge Map — what you know and don't know about the user]\n- You know: ..."
 */
export function buildKnowledgeBoundaryBlock(boundaries: KnowledgeBoundary[]): string {
  if (boundaries.length === 0) return '';

  const known = boundaries.filter((b) => b.status === 'known' || b.status === 'partially-known');
  const knownTopics = new Set(known.map((b) => b.topic));

  // Topics entirely absent from the boundary list are also "unknown"
  const unknownTopics = (KNOWLEDGE_TOPICS as readonly string[]).filter(
    (t) => !knownTopics.has(t),
  ).slice(0, MAX_UNKNOWNS_IN_BLOCK) as KnowledgeTopic[];

  if (known.length === 0 && unknownTopics.length === 0) return '';

  const lines: string[] = [
    '[Knowledge Map — what you know and don\'t know about the user]',
  ];

  // Known / partially-known facts first
  for (const b of known) {
    const prefix = b.status === 'partially-known' ? '(partial) ' : '';
    lines.push(`- You know: ${prefix}${b.evidence ?? b.topic}`);
  }

  // A handful of unknown topics to encourage natural exploration
  if (unknownTopics.length > 0) {
    lines.push('- Topics to explore naturally when the moment is right:');
    for (const topic of unknownTopics) {
      lines.push(`  - You haven't learned yet: ${TOPIC_LABELS[topic]}`);
    }
  }

  return lines.join('\n');
}

/**
 * Returns all {@link KnowledgeTopic} values that the companion has not yet
 * learned about the user.
 *
 * A topic is considered unknown when its boundary entry is absent entirely or
 * has status `'unknown'`.  This list is useful for generating follow-up
 * question suggestions or seeding conversation starters.
 *
 * @param boundaries - All {@link KnowledgeBoundary} records for the current persona.
 * @returns Array of unknown topic labels, in taxonomy order.
 *
 * @example
 * const gaps = getUnknownTopics(boundaries);
 * // ['user_age', 'user_location', 'user_pets', ...]
 */
export function getUnknownTopics(boundaries: KnowledgeBoundary[]): KnowledgeTopic[] {
  const learnedTopics = new Set(
    boundaries
      .filter((b) => b.status === 'known' || b.status === 'partially-known')
      .map((b) => b.topic),
  );

  return (KNOWLEDGE_TOPICS as readonly KnowledgeTopic[]).filter(
    (topic) => !learnedTopics.has(topic),
  );
}
