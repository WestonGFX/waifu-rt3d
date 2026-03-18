/**
 * @fileoverview Session-scoped token usage history tracker for the Token Usage Dashboard.
 *
 * Maintains an in-memory ring buffer of per-request token records, computes aggregate
 * session statistics, applies cloud provider pricing, and estimates how many more
 * messages the user can send before the context budget is exhausted.
 *
 * This module is intentionally session-scoped (no IndexedDB) — data is cleared on
 * page reload, which keeps the dashboard lightweight and avoids schema migrations.
 */

/* ── Types ─────────────────────────────────────────────────────────────────── */

/**
 * A single captured record of token usage for one LLM request/response pair.
 *
 * All counts are integers. Costs are in USD.
 */
export interface TokenHistoryRecord {
  /** Unix timestamp (Date.now()) when the response was received. */
  timestamp: number;
  /** Estimated tokens consumed by the prompt / input. */
  inputTokens: number;
  /** Tokens generated in the response / output. */
  outputTokens: number;
  /** Sum of inputTokens + outputTokens for convenience. */
  totalTokens: number;
  /** Wall-clock latency of the LLM request in milliseconds. */
  latencyMs: number;
  /** Generation speed reported or derived from the LLM provider. */
  tokensPerSecond: number;
  /** Provider identifier, e.g. "ollama", "openai", "anthropic". */
  providerId: string;
  /** Model identifier, e.g. "gpt-4o-mini", "llama3.2:8b". */
  modelId: string;
  /**
   * Fraction of the context window consumed by this request (0–1).
   * Computed from ContextBudgetBreakdown.usageRatio when available.
   */
  contextUsageRatio: number;
  /** Estimated USD cost for this request. Zero for local (ollama) providers. */
  estimatedCostUsd: number;
}

/**
 * Aggregate statistics computed from all records in a TokenHistoryBuffer.
 */
export interface SessionTotals {
  /** Cumulative tokens across all recorded requests. */
  totalTokens: number;
  /** Cumulative estimated cost in USD. */
  totalCostUsd: number;
  /** Number of requests captured in this session. */
  requestCount: number;
  /** Mean generation speed across all requests, in tokens/second. */
  avgTokPerSec: number;
  /** Mean request latency across all requests, in milliseconds. */
  avgLatencyMs: number;
}

/* ── Pricing table ──────────────────────────────────────────────────────────── */

/**
 * Per-provider static pricing rates in USD per 1 000 tokens.
 *
 * Keyed by provider id. Models within the same provider often share a rate
 * tier — for more granular per-model overrides callers can extend this map.
 * Rates are intentionally conservative (use the cheapest popular model for
 * each provider) so cost estimates are never over-stated to the user.
 *
 * Sources (approximate as of early 2026):
 * - OpenAI gpt-4o-mini:          $0.000150 input / $0.000600 output per 1K
 * - Anthropic claude-3-haiku:    $0.000250 input / $0.001250 output per 1K
 * - Google gemini-flash:         $0.000100 input / $0.000400 output per 1K
 * - OpenRouter (generic):        $0.001000 blended per 1K (conservative)
 * - Ollama (local):              $0 (no API fees)
 */
export const CLOUD_PRICING: Record<
  string,
  { inputPer1k: number; outputPer1k: number }
> = {
  openai: { inputPer1k: 0.00015, outputPer1k: 0.0006 },
  anthropic: { inputPer1k: 0.00025, outputPer1k: 0.00125 },
  google: { inputPer1k: 0.0001, outputPer1k: 0.0004 },
  openrouter: { inputPer1k: 0.001, outputPer1k: 0.001 },
  ollama: { inputPer1k: 0, outputPer1k: 0 },
};

/* ── Cost estimation ────────────────────────────────────────────────────────── */

/**
 * Estimates the USD cost of a single LLM request based on provider pricing.
 *
 * Falls back to the openrouter generic rate when the provider id is not found
 * in CLOUD_PRICING so the function always returns a non-negative number.
 *
 * @param providerId - Provider identifier, e.g. "openai" or "ollama".
 * @param _modelId - Model identifier (reserved for future per-model pricing;
 *   currently unused but kept in the signature for API stability).
 * @param inputTokens - Number of prompt / input tokens consumed.
 * @param outputTokens - Number of completion / output tokens generated.
 * @returns Estimated cost in USD (0 for local providers).
 *
 * @example
 * const cost = estimateRequestCost('openai', 'gpt-4o-mini', 1200, 350);
 * // → ~0.000390
 */
export function estimateRequestCost(
  providerId: string,
  _modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rates = CLOUD_PRICING[providerId] ?? CLOUD_PRICING['openrouter'];
  const inputCost = (inputTokens / 1000) * rates.inputPer1k;
  const outputCost = (outputTokens / 1000) * rates.outputPer1k;
  return inputCost + outputCost;
}

/* ── Remaining message estimate ─────────────────────────────────────────────── */

/**
 * Estimates how many more messages the user can send before the context
 * budget runs out, based on the average token cost of recent requests.
 *
 * Uses up to the last 5 records to compute the mean tokens-per-request.
 * Returns 0 when there are no records or when remainingTokens is 0.
 *
 * @param remainingTokens - Tokens still available in the current context window.
 * @param recentRecords - Historical records to derive the per-request average from.
 * @returns Estimated number of full-round-trip messages that can still fit.
 *
 * @example
 * const est = remainingMessageEstimate(3000, sessionTokenHistory.getRecent(5));
 * // → 4  (if average request costs ~750 tokens)
 */
export function remainingMessageEstimate(
  remainingTokens: number,
  recentRecords: TokenHistoryRecord[],
): number {
  if (remainingTokens <= 0 || recentRecords.length === 0) return 0;

  const sample = recentRecords.slice(-5);
  const avgTokensPerRequest =
    sample.reduce((sum, r) => sum + r.totalTokens, 0) / sample.length;

  if (avgTokensPerRequest <= 0) return 0;
  return Math.floor(remainingTokens / avgTokensPerRequest);
}

/* ── Ring buffer ────────────────────────────────────────────────────────────── */

/**
 * In-memory ring buffer that stores up to `maxSize` TokenHistoryRecord entries.
 *
 * Older records are automatically evicted when the buffer is full. This makes
 * the buffer safe for long sessions without unbounded memory growth.
 *
 * @example
 * const buf = new TokenHistoryBuffer(50);
 * buf.push({ timestamp: Date.now(), inputTokens: 500, outputTokens: 200, ... });
 * const totals = buf.getSessionTotals();
 * console.log(totals.requestCount); // 1
 */
export class TokenHistoryBuffer {
  /** Ordered array of captured records (oldest first). */
  private records: TokenHistoryRecord[] = [];

  /** Maximum number of records retained before old ones are evicted. */
  private readonly maxSize: number;

  /**
   * Creates a new TokenHistoryBuffer.
   *
   * @param maxSize - Maximum number of records to retain. Defaults to 200.
   */
  constructor(maxSize = 200) {
    this.maxSize = maxSize;
  }

  /**
   * Appends a new record to the buffer, evicting the oldest entry if needed.
   *
   * @param record - The TokenHistoryRecord to store.
   */
  push(record: TokenHistoryRecord): void {
    if (this.records.length >= this.maxSize) {
      this.records.shift();
    }
    this.records.push(record);
  }

  /**
   * Returns a shallow copy of all records in chronological order (oldest first).
   *
   * @returns All currently stored TokenHistoryRecord entries.
   */
  getAll(): TokenHistoryRecord[] {
    return [...this.records];
  }

  /**
   * Returns the `n` most recent records in chronological order.
   *
   * If the buffer holds fewer than `n` records, all records are returned.
   *
   * @param n - Maximum number of recent records to return.
   * @returns The n most recent TokenHistoryRecord entries.
   *
   * @example
   * const last5 = buf.getRecent(5);
   */
  getRecent(n: number): TokenHistoryRecord[] {
    return this.records.slice(-n);
  }

  /**
   * Computes aggregate statistics across all records in the buffer.
   *
   * Fields that require division (avgTokPerSec, avgLatencyMs) return 0 when
   * there are no records to avoid NaN propagation.
   *
   * @returns A SessionTotals object with cumulative and average metrics.
   *
   * @example
   * const { totalCostUsd, requestCount } = buf.getSessionTotals();
   */
  getSessionTotals(): SessionTotals {
    const count = this.records.length;
    if (count === 0) {
      return {
        totalTokens: 0,
        totalCostUsd: 0,
        requestCount: 0,
        avgTokPerSec: 0,
        avgLatencyMs: 0,
      };
    }

    let totalTokens = 0;
    let totalCostUsd = 0;
    let sumTokPerSec = 0;
    let sumLatencyMs = 0;

    for (const r of this.records) {
      totalTokens += r.totalTokens;
      totalCostUsd += r.estimatedCostUsd;
      sumTokPerSec += r.tokensPerSecond;
      sumLatencyMs += r.latencyMs;
    }

    return {
      totalTokens,
      totalCostUsd,
      requestCount: count,
      avgTokPerSec: sumTokPerSec / count,
      avgLatencyMs: sumLatencyMs / count,
    };
  }

  /**
   * Removes all records from the buffer, resetting it to an empty state.
   * Useful when the user starts a new thread and session metrics should reset.
   */
  clear(): void {
    this.records = [];
  }
}

/* ── Module-level singleton ─────────────────────────────────────────────────── */

/**
 * Shared session-scoped token history buffer.
 *
 * Import this singleton anywhere in the app to push records after LLM responses
 * or read aggregate stats for the Token Usage Dashboard.
 *
 * @example
 * import { sessionTokenHistory } from '@/services/tokenHistoryService';
 *
 * // After receiving a response:
 * sessionTokenHistory.push({
 *   timestamp: Date.now(),
 *   inputTokens: 800,
 *   outputTokens: 320,
 *   totalTokens: 1120,
 *   latencyMs: metrics.latencyMs,
 *   tokensPerSecond: metrics.tokensPerSecond ?? 0,
 *   providerId: 'openai',
 *   modelId: 'gpt-4o-mini',
 *   contextUsageRatio: budget.usageRatio,
 *   estimatedCostUsd: estimateRequestCost('openai', 'gpt-4o-mini', 800, 320),
 * });
 */
export const sessionTokenHistory = new TokenHistoryBuffer();
