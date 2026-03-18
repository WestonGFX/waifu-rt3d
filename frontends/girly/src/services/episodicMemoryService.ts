/**
 * @fileoverview Episodic memory detection service for AnimeGirly.
 *
 * Episodic memories are emotionally significant moments captured from a
 * conversation — first meetings, shared laughter, vulnerability, milestones,
 * and plans. Unlike the factual {@link MemoryRecord} type, episodic memories
 * are retrieved by emotional resonance and tell the story of the relationship.
 *
 * All functions are pure — no React dependency, no side effects.
 */

import { type ChatMessage } from '../types/index.ts';
import { type EpisodicMemory } from '../types/companion.ts';

// ─── Internal constants ────────────────────────────────────────────────────────

/** Number of messages inspected per {@link detectEpisodicMoments} call. */
const SCAN_WINDOW = 10;

/** Maximum episodic moments returned by a single {@link detectEpisodicMoments} call. */
const MAX_MOMENTS_PER_CALL = 3;

/** Maximum memories rendered by {@link formatEpisodicMemoryBlock}. */
const MAX_BLOCK_MEMORIES = 5;

/**
 * Minimum content length (chars) for a message to qualify as a "deep
 * conversation" moment independent of pattern matching.
 */
const DEEP_CONVO_THRESHOLD = 200;

// ─── Pattern catalogue ─────────────────────────────────────────────────────────

/**
 * A single detection rule that associates a regex pattern with a moment
 * category, a base impact score, and a set of emotion tags.
 */
interface DetectionRule {
  /** Compiled regex tested against normalised message content (case-insensitive). */
  pattern: RegExp;
  /** Human-readable category label used to generate the event description. */
  category: string;
  /** Base impact score in [1, 10] before any intensity modifiers. */
  baseImpact: number;
  /** Emotion tags stored alongside the detected moment. */
  emotionTags: string[];
}

/**
 * Ordered catalogue of detection rules applied to every message in the scan
 * window.  Earlier rules take precedence when a message matches multiple
 * patterns.
 */
const DETECTION_RULES: DetectionRule[] = [
  // ── First meeting ──────────────────────────────────────────────────────────
  {
    pattern: /\b(?:nice to meet you|nice meeting you|first time(?: we('ve| have))? (?:talked|spoken|met|chatted)|just met|meeting for the first time)\b/i,
    category: 'first meeting',
    baseImpact: 7,
    emotionTags: ['excitement', 'warmth', 'novelty'],
  },
  // ── Milestone ─────────────────────────────────────────────────────────────
  {
    pattern: /\b(?:anniversary|birthday|first time we|accomplished|achievement|we did it|graduation|promotion|finally made it)\b/i,
    category: 'milestone',
    baseImpact: 8,
    emotionTags: ['pride', 'joy', 'accomplishment'],
  },
  // ── Emotional vulnerability ───────────────────────────────────────────────
  {
    pattern: /\b(?:i(?:'m| am) (?:scared|terrified|afraid|lonely|lost|broken)|it hurts|i(?:'m| am) (?:crying|in pain)|i feel (?:empty|hopeless|worthless|alone)|i(?:'m| am) (?:not okay|falling apart))\b/i,
    category: 'emotional vulnerability',
    baseImpact: 9,
    emotionTags: ['vulnerability', 'sadness', 'trust'],
  },
  {
    pattern: /\b(?:i(?:'m| am) (?:worried|anxious|nervous|overwhelmed)|i can(?:'t| not) (?:cope|stop crying|handle this))\b/i,
    category: 'emotional vulnerability',
    baseImpact: 7,
    emotionTags: ['anxiety', 'vulnerability', 'openness'],
  },
  // ── Shared laughter ───────────────────────────────────────────────────────
  {
    pattern: /(?:hahaha|lmao|lol{2,}|that(?:'s| is) (?:so )?(?:hilarious|hysterical|too funny)|i(?:'m| am) (?:dying|dead) (?:from )?laughing|:D{2,}|XD)/i,
    category: 'shared laughter',
    baseImpact: 6,
    emotionTags: ['joy', 'playfulness', 'connection'],
  },
  // ── Argument / reconciliation ─────────────────────────────────────────────
  {
    pattern: /\b(?:i(?:'m| am) (?:sorry|so sorry)|forgive me|i didn(?:'t| not) mean(?:\s+to)?|that was (?:wrong|unfair|mean) of me|i(?:'m| am) (?:mad|angry|upset|hurt) (?:at you|with you))\b/i,
    category: 'conflict or reconciliation',
    baseImpact: 8,
    emotionTags: ['tension', 'regret', 'repair'],
  },
  // ── Shared plans ─────────────────────────────────────────────────────────
  {
    pattern: /\b(?:we should|let(?:'s| us) (?:go|do|try|plan|watch|visit)|together we(?:'ll| will)|our (?:plan|idea|goal)|(?:let(?:'s| us)) (?:go|do) (?:it|this) together)\b/i,
    category: 'shared plans',
    baseImpact: 6,
    emotionTags: ['anticipation', 'togetherness', 'hope'],
  },
  // ── Affection / confession ────────────────────────────────────────────────
  {
    pattern: /\b(?:i (?:love|adore|cherish|treasure) you|you(?:'re| are) (?:so )?(?:special|important|precious) to me|i(?:'ve| have) (?:fallen for|been thinking about) you|my heart (?:skipped|raced)|i(?:'m| am) in love)\b/i,
    category: 'affection',
    baseImpact: 10,
    emotionTags: ['love', 'affection', 'intimacy'],
  },
];

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Normalises whitespace in a content string.
 *
 * @param value - Raw message content.
 * @returns Trimmed string with internal whitespace collapsed to single spaces.
 */
function normalise(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/**
 * Builds a set of significant tokens from a string by splitting on
 * non-alphanumeric characters and discarding short stop-word-like tokens.
 *
 * @param value - Input string.
 * @returns Set of lowercase tokens with length > 2.
 */
function tokenSet(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter((token) => token.length > 2),
  );
}

/**
 * Computes a recency decay multiplier for a memory's creation timestamp.
 * Mirrors the inline decay used in {@link memoryHeuristicsService}.
 *
 * @param createdAt - Unix timestamp (ms) when the memory was created.
 * @returns Decay factor in [0.05, 1.0]; 1.0 for very recent, trending to 0.05
 *   for memories older than a month.
 */
function recencyDecay(createdAt: number): number {
  const ageHours = (Date.now() - createdAt) / (1000 * 60 * 60);
  if (ageHours < 1) return 1.0;
  if (ageHours < 24) return 0.8;
  if (ageHours < 168) return 0.5; // 1 week
  if (ageHours < 720) return 0.2; // 1 month
  return 0.05;
}

/**
 * Generates a deterministic-ish episodic memory ID that avoids collisions
 * within the same call batch.
 *
 * @param personaId  - Persona this memory belongs to.
 * @param threadId   - Thread the memory was captured from.
 * @param now        - Base timestamp (Date.now()).
 * @param index      - Zero-based position within the batch.
 * @returns Unique string ID.
 */
function makeId(personaId: string, threadId: string, now: number, index: number): string {
  return `ep-${personaId}-${threadId}-${now}-${index}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Scans the most recent messages in a conversation for emotionally significant
 * moments and returns them as {@link EpisodicMemory} records ready for
 * persistence.
 *
 * Detection covers the following event categories:
 * - **First meeting** — "nice to meet you", "first time we met"
 * - **Shared laughter** — "hahaha", "that's hilarious", "lmao"
 * - **Emotional vulnerability** — "I'm scared", "I feel lonely", "it hurts"
 * - **Milestone** — "anniversary", "birthday", "accomplished"
 * - **Deep conversation** — long messages (>{@link DEEP_CONVO_THRESHOLD} chars) with emotional keywords
 * - **Shared plans** — "we should", "let's go", "together we"
 * - **Conflict or reconciliation** — "I'm sorry", "forgive me", "I'm mad at you"
 * - **Affection** — "I love you", "you're so special to me"
 *
 * Both user and assistant messages are scanned so the companion's own
 * emotional expressions (e.g. "I was so happy when…") are captured too.
 *
 * @param messages  - Full ordered message history for the current thread.
 * @param personaId - ID of the active persona (stamped onto returned records).
 * @param threadId  - ID of the current thread (stamped onto returned records).
 * @returns Up to {@link MAX_MOMENTS_PER_CALL} detected episodic moments,
 *   sorted by impact score descending.
 *
 * @example
 * const moments = detectEpisodicMoments(messages, 'persona-1', 'thread-42');
 * // [{ event: 'shared laughter together', emotionTags: ['joy', ...], impactScore: 6, ... }]
 */
export function detectEpisodicMoments(
  messages: ChatMessage[],
  personaId: string,
  threadId: string,
): EpisodicMemory[] {
  const window = messages.slice(-SCAN_WINDOW);
  const now = Date.now();
  const detected: EpisodicMemory[] = [];
  // Track which rule categories have already fired to prevent duplicate moments
  // from the same category appearing across multiple messages.
  const seenCategories = new Set<string>();

  for (const message of window) {
    const content = normalise(message.content);
    if (content.length === 0) continue;

    // ── Pattern-based detection ──────────────────────────────────────────────
    for (const rule of DETECTION_RULES) {
      if (seenCategories.has(rule.category)) continue;

      if (rule.pattern.test(content)) {
        seenCategories.add(rule.category);
        detected.push({
          id: makeId(personaId, threadId, now, detected.length),
          personaId,
          threadId,
          event: `A moment of ${rule.category} shared together`,
          emotionTags: rule.emotionTags,
          impactScore: rule.baseImpact,
          participants: ['user', 'companion'],
          sourceMessageIds: [message.id],
          createdAt: message.timestamp ?? now,
          referenceCount: 0,
        });
      }

      if (detected.length >= MAX_MOMENTS_PER_CALL) break;
    }

    if (detected.length >= MAX_MOMENTS_PER_CALL) break;

    // ── Deep conversation heuristic (no pattern match required) ──────────────
    // Long, emotionally-toned messages that didn't match a specific rule are
    // captured as "deep conversation" moments.
    if (
      !seenCategories.has('deep conversation') &&
      content.length > DEEP_CONVO_THRESHOLD
    ) {
      const lower = content.toLowerCase();
      const emotionalKeywords = [
        'feel', 'feeling', 'emotion', 'heart', 'soul', 'dream', 'hope',
        'fear', 'trust', 'believe', 'care', 'miss', 'remember', 'always',
      ];
      const hitCount = emotionalKeywords.filter((kw) => lower.includes(kw)).length;

      if (hitCount >= 2) {
        seenCategories.add('deep conversation');
        detected.push({
          id: makeId(personaId, threadId, now, detected.length),
          personaId,
          threadId,
          event: 'A deep, meaningful conversation',
          emotionTags: ['depth', 'connection', 'reflection'],
          // Scale impact with emotional keyword density; max 7.
          impactScore: Math.min(7, 4 + hitCount),
          participants: ['user', 'companion'],
          sourceMessageIds: [message.id],
          createdAt: message.timestamp ?? now,
          referenceCount: 0,
        });
      }
    }

    if (detected.length >= MAX_MOMENTS_PER_CALL) break;
  }

  return detected
    .slice(0, MAX_MOMENTS_PER_CALL)
    .sort((a, b) => b.impactScore - a.impactScore);
}

/**
 * Formats an array of episodic memories into a compact prompt-injection block.
 *
 * The block is designed to be injected into the companion's prompt so the
 * LLM can recall shared moments naturally without treating them as raw facts.
 * Output is capped at {@link MAX_BLOCK_MEMORIES} memories ordered by impact
 * score descending so the most significant moments always appear.
 *
 * @param memories - Episodic memory records to format (unsorted is fine).
 * @returns Multi-line formatted string, or an empty string when `memories` is
 *   empty.
 *
 * @example
 * const block = formatEpisodicMemoryBlock(memories);
 * // "[Shared Memories — emotionally significant moments you remember together]\n
 * //  - (impact 9/10) A moment of emotional vulnerability shared together [emotions: vulnerability, sadness, trust]"
 */
export function formatEpisodicMemoryBlock(memories: EpisodicMemory[]): string {
  if (memories.length === 0) return '';

  const sorted = memories
    .slice()
    .sort((a, b) => b.impactScore - a.impactScore)
    .slice(0, MAX_BLOCK_MEMORIES);

  const lines = sorted.map(
    (memory) =>
      `- (impact ${memory.impactScore}/10) ${memory.event} [emotions: ${memory.emotionTags.join(', ')}]`,
  );

  return [
    '[Shared Memories — emotionally significant moments you remember together]',
    ...lines,
  ].join('\n');
}

/**
 * Scores how relevant a single episodic memory is to the current conversation.
 *
 * The score combines three signals:
 * 1. **Token overlap** — how many significant tokens in the memory's `event`
 *    text appear in `queryTokens` (scaled ×2 for weight).
 * 2. **Impact score** — the stored significance of the moment (0–10), scaled
 *    to [0, 1] and weighted ×0.5.
 * 3. **Recency decay** — a decay multiplier that mirrors the logic in
 *    `memoryHeuristicsService` (1.0 → 0.05 over time).
 *
 * @param memory      - The episodic memory to score.
 * @param queryTokens - Token set derived from the current user message or
 *   conversation context.
 * @returns Combined relevance score (higher is more relevant, no upper bound).
 *
 * @example
 * const tokens = new Set(['anniversary', 'birthday', 'celebrate']);
 * const score = scoreEpisodicRelevance(memory, tokens);
 * // e.g. 4.2
 */
export function scoreEpisodicRelevance(
  memory: EpisodicMemory,
  queryTokens: Set<string>,
): number {
  // ── Token overlap ──────────────────────────────────────────────────────────
  const eventTokens = tokenSet(memory.event);
  let overlap = 0;
  for (const token of eventTokens) {
    if (queryTokens.has(token)) overlap += 1;
  }

  // Also check emotion tags for thematic relevance.
  for (const tag of memory.emotionTags) {
    if (queryTokens.has(tag.toLowerCase())) overlap += 0.5;
  }

  // ── Component scores ───────────────────────────────────────────────────────
  const overlapScore = overlap * 2;
  const impactScore = (memory.impactScore / 10) * 0.5;
  const recency = recencyDecay(memory.createdAt);

  return overlapScore + impactScore + recency;
}
