import { type MemoryRecord } from '../types/companion.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum consolidation candidate pairs returned per call. */
const MAX_CANDIDATE_PAIRS = 10;

/** Minimum token-overlap ratio (Jaccard) required to flag a pair as similar. */
const TOKEN_OVERLAP_THRESHOLD = 0.6;

/** Minimum cosine similarity between embeddings to flag a pair as similar. */
const EMBEDDING_SIMILARITY_THRESHOLD = 0.85;

/** Usage count above which decay is halved ("well-remembered" memories). */
const HIGH_USAGE_COUNT = 5;

/** Default decay threshold below which a memory is considered pruneable. */
const DEFAULT_PRUNE_THRESHOLD = 0.1;

/** Memory kinds that are never pruned regardless of decay. */
const PERMANENT_KINDS: ReadonlySet<MemoryRecord['kind']> = new Set([
  'relationship',
  'boundary',
]);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Tokenises a memory text into a set of lower-case word tokens.
 *
 * Tokens shorter than 3 characters are discarded as stop-word noise,
 * matching the pattern used in memoryHeuristicsService.
 *
 * @param text - Raw text to tokenise.
 * @returns Set of lower-case word tokens.
 */
function tokenise(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter((token) => token.length > 2),
  );
}

/**
 * Computes the Jaccard similarity coefficient between two token sets.
 *
 * @param a - First token set.
 * @param b - Second token set.
 * @returns Value in [0, 1]; 0 = no overlap, 1 = identical sets.
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;

  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Computes cosine similarity between two numeric embedding vectors.
 *
 * Returns 0 when either vector is missing, empty, or of mismatched length.
 *
 * @param a - First embedding vector.
 * @param b - Second embedding vector.
 * @returns Value in [-1, 1]; values near 1 indicate near-identical semantics.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;

  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Decides whether two records are similar enough to be merge candidates.
 *
 * A pair qualifies when they share the same `kind` AND at least one of:
 * - Token-overlap Jaccard >= TOKEN_OVERLAP_THRESHOLD
 * - Embedding cosine similarity >= EMBEDDING_SIMILARITY_THRESHOLD (when both
 *   have an embedding vector of the same length)
 *
 * @param a - First memory record.
 * @param b - Second memory record.
 * @returns `true` if the pair should be flagged for consolidation.
 */
function areSimilar(a: MemoryRecord, b: MemoryRecord): boolean {
  if (a.kind !== b.kind) return false;

  // Token-overlap path (always available)
  const tokA = tokenise(a.text);
  const tokB = tokenise(b.text);
  if (jaccardSimilarity(tokA, tokB) >= TOKEN_OVERLAP_THRESHOLD) return true;

  // Embedding path (only when both records carry a vector)
  if (
    a.embedding &&
    b.embedding &&
    a.embedding.length > 0 &&
    b.embedding.length === a.embedding.length
  ) {
    if (cosineSimilarity(a.embedding, b.embedding) >= EMBEDDING_SIMILARITY_THRESHOLD) {
      return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Finds pairs of memories that are similar enough to be merged.
 *
 * Similarity is determined by same `kind` AND either:
 * - Jaccard token-overlap >= 60 %
 * - Embedding cosine similarity >= 0.85 (when both records have embeddings)
 *
 * The function caps its output at 10 pairs to keep downstream work bounded.
 * The same record can appear in multiple pairs; the caller must deduplicate
 * before writing merged results back to the store.
 *
 * @param records - All candidate memory records (any mix of kinds).
 * @returns Array of `[a, b]` pairs flagged for consolidation, max 10.
 *
 * @example
 * const pairs = findConsolidationCandidates(allMemories);
 * for (const [a, b] of pairs) {
 *   const merged = consolidateMemoryPair(a, b);
 *   // persist merged, delete a and b
 * }
 */
export function findConsolidationCandidates(
  records: MemoryRecord[],
): Array<[MemoryRecord, MemoryRecord]> {
  const pairs: Array<[MemoryRecord, MemoryRecord]> = [];

  outer: for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      if (areSimilar(records[i], records[j])) {
        pairs.push([records[i], records[j]]);
        if (pairs.length >= MAX_CANDIDATE_PAIRS) break outer;
      }
    }
  }

  return pairs;
}

/**
 * Merges two similar memory records into a single consolidated record.
 *
 * Merge rules:
 * - `salience` and `confidence` take the higher of the two values.
 * - `sourceMessageIds` is the deduplicated union of both arrays.
 * - `text` keeps the longer version as the primary surface; if both are the
 *   same length the newer record's text wins.
 * - `embedding` is taken from whichever record was created more recently (if
 *   present) since it reflects more current semantic context.
 * - `usageCount` is summed across both records.
 * - `emotionTags` are merged and deduplicated.
 * - `createdAt` is the earlier of the two (preserves original creation time).
 * - `consolidatedFrom` is set to `[a.id, b.id]` as an audit trail.
 * - A new unique ID is generated in the form `consolidated-{timestamp}-{random}`.
 *
 * @param a - First memory record.
 * @param b - Second memory record (must share the same `kind` as `a`).
 * @returns A new `MemoryRecord` representing the merged memory.
 *
 * @example
 * const merged = consolidateMemoryPair(oldFact, newerFact);
 * await db.memories.add(merged);
 * await db.memories.bulkDelete([oldFact.id, newerFact.id]);
 */
export function consolidateMemoryPair(
  a: MemoryRecord,
  b: MemoryRecord,
): MemoryRecord {
  const newerRecord = a.createdAt >= b.createdAt ? a : b;

  // Prefer the longer text; fall back to the newer record's text on a tie.
  const mergedText =
    a.text.length > b.text.length
      ? a.text
      : b.text.length > a.text.length
        ? b.text
        : newerRecord.text;

  // Deduplicated union of source message IDs.
  const mergedSourceIds = Array.from(new Set([...a.sourceMessageIds, ...b.sourceMessageIds]));

  // Deduplicated union of emotion tags (both may be undefined).
  const emotionTagSet = new Set<string>([
    ...(a.emotionTags ?? []),
    ...(b.emotionTags ?? []),
  ]);
  const mergedEmotionTags = emotionTagSet.size > 0
    ? Array.from(emotionTagSet)
    : undefined;

  // Embedding from the more recent record (if available).
  const mergedEmbedding = newerRecord.embedding ?? (
    a.embedding ? a.embedding : b.embedding
  );
  const mergedEmbeddingModel = newerRecord.embeddingModel ?? (
    a.embeddingModel ? a.embeddingModel : b.embeddingModel
  );

  const newId = `consolidated-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  return {
    id: newId,
    personaId: a.personaId,
    threadId: a.threadId,
    kind: a.kind,
    text: mergedText,
    salience: Math.max(a.salience, b.salience),
    confidence: Math.max(a.confidence, b.confidence),
    createdAt: Math.min(a.createdAt, b.createdAt),
    lastUsedAt: newerRecord.lastUsedAt,
    lastAccessedAt: newerRecord.lastAccessedAt,
    sourceMessageIds: mergedSourceIds,
    embedding: mergedEmbedding,
    embeddingModel: mergedEmbeddingModel,
    usageCount: (a.usageCount ?? 0) + (b.usageCount ?? 0),
    emotionTags: mergedEmotionTags,
    // Carry over the higher impact score if present.
    impactScore:
      a.impactScore !== undefined || b.impactScore !== undefined
        ? Math.max(a.impactScore ?? 0, b.impactScore ?? 0)
        : undefined,
    // Carry forward the existing decay factor from the newer record; if both
    // lack one the field is intentionally omitted until applyDecay runs.
    decayFactor: newerRecord.decayFactor,
    consolidatedFrom: [a.id, b.id],
    contradicts: newerRecord.contradicts,
    knowledgeSource: newerRecord.knowledgeSource,
  };
}

/**
 * Applies time-based decay to a collection of memory records.
 *
 * The `decayFactor` field of each returned record is updated according to
 * how long ago the memory was created:
 *
 * | Age           | Base decay factor |
 * |---------------|-------------------|
 * | < 1 day       | 1.0               |
 * | < 1 week      | 0.9               |
 * | < 1 month     | 0.7               |
 * | < 3 months    | 0.4               |
 * | >= 3 months   | 0.15              |
 *
 * Memories with `usageCount > 5` decay 50 % slower (their factor is raised
 * halfway back toward 1.0) to model the psychological effect of rehearsal.
 *
 * This function is **pure** — it returns new record objects and never writes
 * to the database. The caller is responsible for persisting the result.
 *
 * @param records - Memory records to process.
 * @param now - Optional timestamp override (defaults to `Date.now()`).
 * @returns New array of records with updated `decayFactor` values.
 *
 * @example
 * const decayed = applyDecay(rawRecords);
 * const { kept, pruned } = pruneDecayedMemories(decayed);
 * await db.memories.bulkPut(kept);
 * await db.memories.bulkDelete(pruned.map((r) => r.id));
 */
export function applyDecay(
  records: MemoryRecord[],
  now: number = Date.now(),
): MemoryRecord[] {
  const MS_PER_DAY = 86_400_000;
  const MS_PER_WEEK = MS_PER_DAY * 7;
  const MS_PER_MONTH = MS_PER_DAY * 30;
  const MS_PER_THREE_MONTHS = MS_PER_DAY * 90;

  return records.map((record) => {
    const ageMs = now - record.createdAt;

    let baseDecay: number;
    if (ageMs < MS_PER_DAY) {
      baseDecay = 1.0;
    } else if (ageMs < MS_PER_WEEK) {
      baseDecay = 0.9;
    } else if (ageMs < MS_PER_MONTH) {
      baseDecay = 0.7;
    } else if (ageMs < MS_PER_THREE_MONTHS) {
      baseDecay = 0.4;
    } else {
      baseDecay = 0.15;
    }

    // High-usage memories decay more slowly: boost their factor 50 % of the
    // remaining distance toward 1.0 (rehearsal effect).
    const isHighUsage = (record.usageCount ?? 0) > HIGH_USAGE_COUNT;
    const decayFactor = isHighUsage
      ? baseDecay + (1.0 - baseDecay) * 0.5
      : baseDecay;

    return { ...record, decayFactor };
  });
}

/**
 * Partitions records into kept and pruned sets based on their `decayFactor`.
 *
 * A record is pruned when its `decayFactor` is defined and falls strictly
 * below `threshold`. Records whose `decayFactor` is `undefined` are treated
 * as fresh (i.e., kept) because decay has not yet been applied.
 *
 * `'relationship'` and `'boundary'` records are **always** kept, regardless
 * of their decay factor, because they carry safety and identity information
 * that must persist across the full relationship lifetime.
 *
 * This function is **pure** — it never deletes anything. The caller decides
 * whether to archive or hard-delete the pruned records.
 *
 * @param records - Memory records to partition (should have `decayFactor` set
 *   by a prior call to `applyDecay`).
 * @param threshold - Decay factor below which a record is pruned.
 *   Defaults to 0.1.
 * @returns Object with `kept` (surviving records) and `pruned` (removed
 *   records) arrays. Together they cover every input record exactly once.
 *
 * @example
 * const decayed = applyDecay(allRecords);
 * const { kept, pruned } = pruneDecayedMemories(decayed, 0.2);
 * console.log(`Pruning ${pruned.length} stale memories.`);
 */
export function pruneDecayedMemories(
  records: MemoryRecord[],
  threshold: number = DEFAULT_PRUNE_THRESHOLD,
): { kept: MemoryRecord[]; pruned: MemoryRecord[] } {
  const kept: MemoryRecord[] = [];
  const pruned: MemoryRecord[] = [];

  for (const record of records) {
    // Permanent kinds are never pruned.
    if (PERMANENT_KINDS.has(record.kind)) {
      kept.push(record);
      continue;
    }

    // Records without a decay factor haven't been processed yet; keep them.
    if (record.decayFactor === undefined || record.decayFactor >= threshold) {
      kept.push(record);
    } else {
      pruned.push(record);
    }
  }

  return { kept, pruned };
}
