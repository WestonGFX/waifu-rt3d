/**
 * @fileoverview Embedding service for semantic memory retrieval.
 *
 * Wraps Ollama's /api/embed endpoint (nomic-embed-text, 768-dimensional vectors)
 * and exposes pure scoring utilities used by the Advanced Memory system to rank
 * memories by semantic relevance rather than simple token overlap.
 */

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';
const EMBED_MODEL = 'nomic-embed-text';
const EMBED_TIMEOUT_MS = 5_000;

/** Shape of a successful Ollama /api/embed response. */
interface OllamaEmbedResponse {
  embeddings: number[][];
}

/** In-memory cache entry for availability checks. */
interface AvailabilityCache {
  result: boolean;
  expiresAt: number;
}

/** Module-level availability cache — avoids hammering Ollama on every render. */
let availabilityCache: AvailabilityCache | null = null;
const AVAILABILITY_CACHE_TTL_MS = 60_000;

// ---------------------------------------------------------------------------
// Core embedding generation
// ---------------------------------------------------------------------------

/**
 * Generates a 768-dimensional embedding vector for the given text using
 * Ollama's nomic-embed-text model.
 *
 * Returns `null` if Ollama is unreachable, the request times out, or the
 * response does not contain a valid embedding array. The caller should fall
 * back to lexical scoring when this returns `null`.
 *
 * @param text - The text to embed. Should be non-empty.
 * @param ollamaBaseUrl - Base URL of the Ollama instance. Defaults to
 *   `http://localhost:11434`.
 * @returns A 768-element float array, or `null` on failure.
 *
 * @example
 * const vec = await generateEmbedding("I love ramen");
 * if (vec !== null) {
 *   console.log(vec.length); // 768
 * }
 */
export async function generateEmbedding(
  text: string,
  ollamaBaseUrl: string = DEFAULT_OLLAMA_BASE_URL,
): Promise<number[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);

  try {
    const response = await fetch(`${ollamaBaseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, input: text }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as OllamaEmbedResponse;

    if (!Array.isArray(data.embeddings) || data.embeddings.length === 0) {
      return null;
    }

    const embedding = data.embeddings[0];
    if (!Array.isArray(embedding) || embedding.length === 0) {
      return null;
    }

    return embedding;
  } catch {
    // Network error, timeout (AbortError), or JSON parse failure — all silent.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Pure vector math
// ---------------------------------------------------------------------------

/**
 * Computes the cosine similarity between two equal-length numeric vectors.
 *
 * Returns a value in the range [-1, 1] where 1 means identical direction and
 * -1 means opposite. Returns 0 when either vector is a zero vector to avoid
 * division by zero.
 *
 * @param a - First embedding vector.
 * @param b - Second embedding vector, must have the same length as `a`.
 * @returns Cosine similarity in [-1, 1].
 *
 * @example
 * const sim = cosineSimilarity([1, 0, 0], [1, 0, 0]);
 * console.log(sim); // 1
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;

  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return 0;

  // Clamp to [-1, 1] to guard against floating-point drift.
  return Math.max(-1, Math.min(1, dot / denom));
}

// ---------------------------------------------------------------------------
// Recency decay
// ---------------------------------------------------------------------------

/**
 * Computes a recency decay weight in [0, 1] for a memory created at the given
 * timestamp. Fresher memories score closer to 1; very old memories approach 0.
 *
 * Decay schedule (approximate):
 * - < 1 hour  → 1.0
 * - 1 day     → 0.8
 * - 1 week    → 0.5
 * - 1 month   → 0.2
 * - > 3 months → 0.05
 *
 * The curve is a piecewise linear interpolation between these anchors so
 * callers always receive a smooth, predictable value.
 *
 * @param createdAt - Unix epoch milliseconds when the memory was stored.
 * @param now - Reference time in milliseconds. Defaults to `Date.now()`.
 * @returns Decay weight in [0.05, 1.0].
 *
 * @example
 * // A memory from 2 days ago
 * const w = computeRecencyDecay(Date.now() - 2 * 24 * 60 * 60 * 1000);
 * console.log(w); // ~0.65
 */
export function computeRecencyDecay(createdAt: number, now: number = Date.now()): number {
  const ageMs = Math.max(0, now - createdAt);

  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  const WEEK = 7 * DAY;
  const MONTH = 30 * DAY;
  const THREE_MONTHS = 90 * DAY;

  // Anchor points: [ageMs, weight]
  const anchors: Array<[number, number]> = [
    [0, 1.0],
    [HOUR, 1.0],
    [DAY, 0.8],
    [WEEK, 0.5],
    [MONTH, 0.2],
    [THREE_MONTHS, 0.05],
  ];

  // Clamp beyond the final anchor.
  if (ageMs >= THREE_MONTHS) return 0.05;

  // Piecewise linear interpolation between consecutive anchors.
  for (let i = 0; i < anchors.length - 1; i++) {
    const [t0, w0] = anchors[i];
    const [t1, w1] = anchors[i + 1];
    if (ageMs >= t0 && ageMs <= t1) {
      const t = (ageMs - t0) / (t1 - t0);
      return w0 + t * (w1 - w0);
    }
  }

  return 0.05;
}

// ---------------------------------------------------------------------------
// Composite ranking score
// ---------------------------------------------------------------------------

/**
 * Combines semantic similarity, salience, and recency into a single ranking
 * score suitable for sorting memories by relevance.
 *
 * Formula: `(cosineSimilarity * 2) + salience + (recencyDecay * 0.5)`
 *
 * The cosine similarity term is doubled so semantic meaning dominates over
 * salience. Recency is a lighter tiebreaker.
 *
 * @param queryEmbedding - Embedding vector of the user's current message.
 * @param memoryEmbedding - Embedding vector of the candidate memory.
 * @param salience - Stored salience value for the memory (typically 0–1).
 * @param recencyDecay - Recency weight computed by `computeRecencyDecay`
 *   (0.05–1.0).
 * @returns Combined score (higher = more relevant). Unbounded but typically
 *   in the range [0, 3.5].
 *
 * @example
 * const score = semanticScore(queryVec, memVec, 0.8, 0.9);
 * // Returns a value that can be compared across candidate memories.
 */
export function semanticScore(
  queryEmbedding: number[],
  memoryEmbedding: number[],
  salience: number,
  recencyDecay: number,
): number {
  const similarity = cosineSimilarity(queryEmbedding, memoryEmbedding);
  return similarity * 2 + salience + recencyDecay * 0.5;
}

// ---------------------------------------------------------------------------
// Availability probe
// ---------------------------------------------------------------------------

/**
 * Checks whether the nomic-embed-text model is available on the target Ollama
 * instance by issuing a minimal embed request.
 *
 * The result is cached for 60 seconds so that callers can safely invoke this
 * function on every chat turn without causing excessive network traffic.
 *
 * @param ollamaBaseUrl - Base URL of the Ollama instance. Defaults to
 *   `http://localhost:11434`.
 * @returns `true` if embedding is available and the model responded, `false`
 *   otherwise.
 *
 * @example
 * if (await isEmbeddingAvailable()) {
 *   const vec = await generateEmbedding(userMessage);
 * }
 */
export async function isEmbeddingAvailable(
  ollamaBaseUrl: string = DEFAULT_OLLAMA_BASE_URL,
): Promise<boolean> {
  const now = Date.now();

  if (availabilityCache !== null && now < availabilityCache.expiresAt) {
    return availabilityCache.result;
  }

  // Probe with the shortest meaningful text to minimise latency.
  const probeResult = await generateEmbedding('ping', ollamaBaseUrl);
  const result = probeResult !== null && probeResult.length > 0;

  availabilityCache = { result, expiresAt: now + AVAILABILITY_CACHE_TTL_MS };
  return result;
}
