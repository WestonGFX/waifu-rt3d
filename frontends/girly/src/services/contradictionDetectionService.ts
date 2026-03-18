/**
 * Contradiction detection service — identifies conflicting information across
 * memory records and surfaces the conflicts for gentle resolution by the LLM.
 *
 * Detection is intentionally conservative: the service prefers false negatives
 * over false positives so that legitimate nuance (e.g. a user who "likes horror
 * movies but not slasher films") is never flagged as contradictory. Only records
 * of the same `kind` are compared, and a minimum token-overlap threshold must be
 * satisfied before any heuristic is applied.
 *
 * Detection strategies (in priority order):
 *  1. Negation — "likes X" vs "doesn't like X", "is a Y" vs "is not a Y".
 *  2. Value conflict — same subject anchored to two different values
 *     (e.g. "lives in Tokyo" vs "lives in New York").
 *  3. Temporal conflict — identical fact text recorded at very different times,
 *     suggesting the older record is stale.
 */

import { type MemoryRecord } from '../types/companion.ts';

/* ── Public types ─────────────────────────────────────────────────────────── */

/**
 * A pair of memory records that appear to contradict each other.
 */
export interface ContradictionPair {
  /** The first of the two conflicting records. */
  recordA: MemoryRecord;
  /** The second of the two conflicting records. */
  recordB: MemoryRecord;
  /**
   * Confidence that this is a genuine contradiction, in the range [0, 1].
   * Values below ~0.5 should be treated as low-signal noise.
   */
  confidence: number;
  /** Human-readable explanation of why these records conflict. */
  reason: string;
}

/* ── Constants ────────────────────────────────────────────────────────────── */

/** Minimum Jaccard-style token overlap required before checking for conflicts. */
const MIN_TOKEN_OVERLAP_FOR_CHECK = 0.2;

/** Maximum number of pairs returned by `detectContradictions`. */
const MAX_PAIRS = 10;

/** Maximum number of alerts included in the prompt block. */
const MAX_ALERT_PAIRS = 3;

/** Age difference in milliseconds that triggers temporal-conflict detection. */
const TEMPORAL_CONFLICT_AGE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Confidence boost applied to the winning record during resolution. */
const WINNER_CONFIDENCE_BOOST = 0.05;

/** Words and phrases that signal negation in English. */
const NEGATION_MARKERS = [
  'not',
  "don't",
  'do not',
  "doesn't",
  'does not',
  "didn't",
  'did not',
  "isn't",
  'is not',
  "aren't",
  'are not',
  "wasn't",
  'was not',
  "weren't",
  'were not',
  "won't",
  'will not',
  "can't",
  'cannot',
  "couldn't",
  'could not',
  'no longer',
  'never',
  'neither',
  'nor',
  'hate',
  'hates',
  'hated',
  'dislike',
  'dislikes',
  'disliked',
  'despise',
  'despises',
  'despised',
  'avoid',
  'avoids',
  'avoided',
];

/** Positive-sentiment markers whose subjects are compared against negation markers. */
const POSITIVE_MARKERS = [
  'like',
  'likes',
  'liked',
  'love',
  'loves',
  'loved',
  'enjoy',
  'enjoys',
  'enjoyed',
  'prefer',
  'prefers',
  'preferred',
  'want',
  'wants',
  'wanted',
  'adore',
  'adores',
  'adored',
];

/* ── Internal helpers ─────────────────────────────────────────────────────── */

/**
 * Splits text into a filtered set of meaningful lowercase tokens.
 *
 * Tokens shorter than 3 characters and pure stop-words are excluded to
 * reduce noise in overlap calculations. This mirrors the implementation
 * in `memoryHeuristicsService.ts`.
 *
 * @param text - The string to tokenize.
 * @returns A `Set` of lowercase tokens.
 */
function getTokenSet(text: string): Set<string> {
  return new Set(
    text
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter((token) => token.length > 2),
  );
}

/**
 * Computes the fraction of tokens shared between two strings.
 *
 * Uses an asymmetric overlap ratio: shared / min(|A|, |B|). This is
 * intentionally generous so that short phrases like "lives in Tokyo" match
 * fragments inside longer sentences.
 *
 * @param a - First string.
 * @param b - Second string.
 * @returns Overlap ratio in [0, 1]. Returns 0 if either string tokenizes to nothing.
 *
 * @example
 * tokenOverlap('lives in Tokyo', 'lives in New York') // ≈ 0.67 (shares "lives", "in")
 */
function tokenOverlap(a: string, b: string): number {
  const tokensA = getTokenSet(a);
  const tokensB = getTokenSet(b);

  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let shared = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) shared += 1;
  }

  return shared / Math.min(tokensA.size, tokensB.size);
}

/**
 * Returns whether a string contains any negation markers.
 *
 * The check is word-boundary-aware for single-word markers and substring
 * aware for multi-word phrases (e.g. "no longer").
 *
 * @param text - Text to examine.
 * @returns `true` if at least one negation marker is found.
 *
 * @example
 * hasNegation("I don't like spiders") // true
 * hasNegation("I love spiders")       // false
 */
function hasNegation(text: string): boolean {
  const lower = text.toLowerCase();
  return NEGATION_MARKERS.some((marker) => {
    // Multi-word markers: substring check is sufficient
    if (marker.includes(' ')) return lower.includes(marker);
    // Single-word markers: require word boundaries to avoid "notable" matching "not"
    return new RegExp(`\\b${marker}\\b`).test(lower);
  });
}

/**
 * Returns whether a string contains a positive-sentiment marker but no negation.
 *
 * @param text - Text to examine.
 * @returns `true` if positive marker found and no negation present.
 */
function hasPositiveMarker(text: string): boolean {
  const lower = text.toLowerCase();
  const hasPositive = POSITIVE_MARKERS.some((marker) =>
    new RegExp(`\\b${marker}\\b`).test(lower),
  );
  return hasPositive && !hasNegation(text);
}

/**
 * Attempts to extract a subject-value pair from a declarative fact sentence.
 *
 * Recognises patterns of the form:
 *  - "[subject] is [value]"   — e.g. "user is 24 years old"
 *  - "[subject] lives in [value]" — e.g. "user lives in Tokyo"
 *  - "[subject] works as [value]" — e.g. "user works as a nurse"
 *  - "[subject] works in [value]" — e.g. "user works in finance"
 *  - "[subject]'s [attribute] is [value]" — e.g. "user's name is Alex"
 *
 * Returns `null` when no recognisable pattern matches. The subject and value
 * are returned lowercase and trimmed.
 *
 * @param text - The memory record text to parse.
 * @returns An object with `subject` and `value` fields, or `null`.
 *
 * @example
 * extractSubjectValue("User is 24 years old")
 * // { subject: "user", value: "24 years old" }
 *
 * extractSubjectValue("Prefers dark roast coffee")
 * // null
 */
function extractSubjectValue(text: string): { subject: string; value: string } | null {
  const lower = text.trim().toLowerCase();

  // Pattern: "<subject> is <value>"
  const isPattern = lower.match(/\b([a-z']+(?:\s+[a-z']+){0,3})\s+is\s+(.{2,60})/);
  if (isPattern) {
    return { subject: isPattern[1].trim(), value: isPattern[2].trim() };
  }

  // Pattern: "<subject>'s <attribute> is <value>"
  const possessivePattern = lower.match(
    /\b([a-z]+)'s\s+([a-z\s]+?)\s+is\s+(.{2,60})/,
  );
  if (possessivePattern) {
    const subject = `${possessivePattern[1]}'s ${possessivePattern[2].trim()}`;
    return { subject, value: possessivePattern[3].trim() };
  }

  // Pattern: "<subject> lives in <value>"
  const livesPattern = lower.match(/\b([a-z']+(?:\s+[a-z']+){0,2})\s+lives?\s+in\s+(.{2,60})/);
  if (livesPattern) {
    return { subject: `${livesPattern[1]} lives in`, value: livesPattern[2].trim() };
  }

  // Pattern: "<subject> works as <value>" or "<subject> works in <value>"
  const worksPattern = lower.match(
    /\b([a-z']+(?:\s+[a-z']+){0,2})\s+works?\s+(?:as|in)\s+(.{2,60})/,
  );
  if (worksPattern) {
    return { subject: `${worksPattern[1]} works`, value: worksPattern[2].trim() };
  }

  return null;
}

/* ── Detection strategies ─────────────────────────────────────────────────── */

/**
 * Checks whether two records contradict via negation: one expresses a positive
 * sentiment toward a subject while the other negates it.
 *
 * For example: "Enjoys hiking" vs "Doesn't enjoy hiking".
 *
 * @param a - First memory record text.
 * @param b - Second memory record text.
 * @returns A partial `ContradictionPair` if a negation conflict is found, or `null`.
 */
function checkNegationConflict(
  a: string,
  b: string,
): { confidence: number; reason: string } | null {
  const aNegated = hasNegation(a);
  const bNegated = hasNegation(b);
  const aPositive = hasPositiveMarker(a);
  const bPositive = hasPositiveMarker(b);

  // One must be positive and the other negated; both being negated is not a conflict.
  const conflict = (aPositive && bNegated) || (aNegated && bPositive);
  if (!conflict) return null;

  // Require meaningful shared content so we don't flag "loves cats" vs "hates rain"
  const overlap = tokenOverlap(a, b);
  if (overlap < MIN_TOKEN_OVERLAP_FOR_CHECK) return null;

  // Confidence scales with overlap — high overlap means the subject is clearly the same
  const confidence = Math.min(0.9, 0.4 + overlap * 0.6);

  const [positiveText, negatedText] = aPositive ? [a, b] : [b, a];
  return {
    confidence,
    reason: `Positive ("${positiveText}") conflicts with negation ("${negatedText}")`,
  };
}

/**
 * Checks whether two records describe the same subject with mutually exclusive values.
 *
 * For example: "User lives in Tokyo" vs "User lives in New York".
 *
 * @param a - First memory record text.
 * @param b - Second memory record text.
 * @returns A partial `ContradictionPair` if a value conflict is found, or `null`.
 */
function checkValueConflict(
  a: string,
  b: string,
): { confidence: number; reason: string } | null {
  const pairA = extractSubjectValue(a);
  const pairB = extractSubjectValue(b);

  if (!pairA || !pairB) return null;
  if (pairA.subject !== pairB.subject) return null;

  // Same subject, different value → value conflict
  if (pairA.value === pairB.value) return null;

  const overlap = tokenOverlap(pairA.value, pairB.value);
  // If the values are very similar (e.g. "24 years old" vs "24"), do not flag
  if (overlap > 0.7) return null;

  return {
    confidence: 0.75,
    reason: `Conflicting values for subject "${pairA.subject}": "${pairA.value}" vs "${pairB.value}"`,
  };
}

/**
 * Checks whether two records appear to express the same fact but were recorded
 * far enough apart in time that one of them is likely stale.
 *
 * For example: "User is 24 years old" recorded two years apart.
 *
 * @param a - First memory record.
 * @param b - Second memory record.
 * @returns A partial `ContradictionPair` if a temporal conflict is found, or `null`.
 */
function checkTemporalConflict(
  a: MemoryRecord,
  b: MemoryRecord,
): { confidence: number; reason: string } | null {
  const ageDiff = Math.abs(a.createdAt - b.createdAt);
  if (ageDiff < TEMPORAL_CONFLICT_AGE_THRESHOLD_MS) return null;

  // Only meaningful if the texts are substantially similar (same claim over time)
  const overlap = tokenOverlap(a.text, b.text);
  if (overlap < 0.6) return null;

  const olderRecord = a.createdAt < b.createdAt ? a : b;
  const newerRecord = a.createdAt < b.createdAt ? b : a;

  const ageMonths = Math.round(ageDiff / (30 * 24 * 60 * 60 * 1000));
  return {
    confidence: 0.55,
    reason: `Possible stale fact: "${olderRecord.text}" (${ageMonths}mo old) may be outdated — newer record says "${newerRecord.text}"`,
  };
}

/* ── Public API ───────────────────────────────────────────────────────────── */

/**
 * Detects contradictions across a list of memory records.
 *
 * Records are grouped by `kind` before comparison so that a preference record
 * is never compared against a world-building record. Within each group every
 * unique pair is evaluated using three detection strategies (negation, value
 * conflict, temporal conflict). The first strategy that returns a result wins
 * for any given pair.
 *
 * Results are sorted by confidence descending and capped at 10 pairs to keep
 * the output manageable for downstream consumers.
 *
 * @param records - All memory records to inspect. The caller is responsible for
 *   scoping these to a single persona (the service does not filter by personaId).
 * @returns Up to 10 contradiction pairs, sorted by confidence descending.
 *
 * @example
 * const pairs = detectContradictions(memoryRecords);
 * if (pairs.length > 0) {
 *   const block = buildContradictionAlertBlock(pairs);
 *   injectIntoPrompt(block);
 * }
 */
export function detectContradictions(records: MemoryRecord[]): ContradictionPair[] {
  if (records.length < 2) return [];

  // Group records by kind so comparisons are always semantically homogenous
  const byKind = new Map<MemoryRecord['kind'], MemoryRecord[]>();
  for (const record of records) {
    const group = byKind.get(record.kind) ?? [];
    group.push(record);
    byKind.set(record.kind, group);
  }

  const pairs: ContradictionPair[] = [];

  for (const group of byKind.values()) {
    if (group.length < 2) continue;

    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];

        // Skip self-contradictions (same ID — should never happen, but guard anyway)
        if (a.id === b.id) continue;

        // Attempt each strategy in priority order; use the first that fires
        const negation = checkNegationConflict(a.text, b.text);
        if (negation) {
          pairs.push({ recordA: a, recordB: b, ...negation });
          continue;
        }

        const valueConflict = checkValueConflict(a.text, b.text);
        if (valueConflict) {
          pairs.push({ recordA: a, recordB: b, ...valueConflict });
          continue;
        }

        const temporalConflict = checkTemporalConflict(a, b);
        if (temporalConflict) {
          pairs.push({ recordA: a, recordB: b, ...temporalConflict });
        }
      }
    }
  }

  return pairs
    .sort((x, y) => y.confidence - x.confidence)
    .slice(0, MAX_PAIRS);
}

/**
 * Formats up to 3 contradiction pairs as a prompt injection block.
 *
 * The block uses a gentle framing so the LLM resolves conflicts through
 * natural conversation rather than blunt corrections. Returns an empty
 * string when there are no pairs, allowing the caller to skip injection.
 *
 * @param pairs - Contradiction pairs produced by `detectContradictions`.
 * @returns A formatted multi-line string for prompt injection, or `''`.
 *
 * @example
 * const block = buildContradictionAlertBlock(pairs);
 * // "[Memory Contradiction Alert — resolve these gently by asking the user]\n- ..."
 */
export function buildContradictionAlertBlock(pairs: ContradictionPair[]): string {
  if (pairs.length === 0) return '';

  const top = pairs.slice(0, MAX_ALERT_PAIRS);
  const lines = top.map((pair) => {
    const pct = Math.round(pair.confidence * 100);
    return `- ${pair.reason} (confidence: ${pct}%)`;
  });

  return [
    '[Memory Contradiction Alert — resolve these gently by asking the user]',
    ...lines,
  ].join('\n');
}

/**
 * Resolves a contradiction by designating a winner and marking the loser.
 *
 * This function does NOT persist any changes — it returns updated copies of
 * both records. The caller is responsible for persisting the results to
 * IndexedDB via `CompanionContext` or the Dexie table directly.
 *
 * Resolution rules:
 *  - The loser's `contradicts` array gains the winner's ID.
 *  - The winner's `confidence` is boosted by 0.05, capped at 1.0.
 *
 * @param winner - The record that should be treated as authoritative.
 * @param loser - The record that should be deprecated.
 * @returns `{ updated, deprecated }` — immutable updated copies of both records.
 *
 * @example
 * const { updated, deprecated } = resolveContradiction(newerRecord, olderRecord);
 * await db.memoryRecords.bulkPut([updated, deprecated]);
 */
export function resolveContradiction(
  winner: MemoryRecord,
  loser: MemoryRecord,
): { updated: MemoryRecord; deprecated: MemoryRecord } {
  const updated: MemoryRecord = {
    ...winner,
    confidence: Math.min(1.0, winner.confidence + WINNER_CONFIDENCE_BOOST),
  };

  const existingContradicts = loser.contradicts ?? [];
  const deprecated: MemoryRecord = {
    ...loser,
    contradicts: existingContradicts.includes(winner.id)
      ? existingContradicts
      : [...existingContradicts, winner.id],
  };

  return { updated, deprecated };
}
