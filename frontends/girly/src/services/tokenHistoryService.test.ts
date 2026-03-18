import { beforeEach, describe, expect, it } from 'vitest';
import {
  CLOUD_PRICING,
  TokenHistoryBuffer,
  estimateRequestCost,
  remainingMessageEstimate,
  sessionTokenHistory,
  type TokenHistoryRecord,
} from './tokenHistoryService.ts';

/* ── Helper ─────────────────────────────────────────────────────────────────── */

/**
 * Returns a complete TokenHistoryRecord with sensible defaults.
 * Pass `overrides` to pin only the fields relevant to a specific test.
 *
 * @param overrides - Partial record fields that override the defaults.
 * @returns A fully-populated TokenHistoryRecord.
 */
function createMockRecord(overrides: Partial<TokenHistoryRecord> = {}): TokenHistoryRecord {
  return {
    timestamp: 1_700_000_000_000,
    inputTokens: 400,
    outputTokens: 150,
    totalTokens: 550,
    latencyMs: 1200,
    tokensPerSecond: 45,
    providerId: 'ollama',
    modelId: 'llama3.2:8b',
    contextUsageRatio: 0.25,
    estimatedCostUsd: 0,
    ...overrides,
  };
}

/* ── TokenHistoryBuffer ─────────────────────────────────────────────────────── */

describe('TokenHistoryBuffer', () => {
  let buf: TokenHistoryBuffer;

  beforeEach(() => {
    buf = new TokenHistoryBuffer(200);
  });

  describe('push / getAll', () => {
    it('adds a record and getAll returns it', () => {
      const record = createMockRecord();
      buf.push(record);

      const all = buf.getAll();
      expect(all).toHaveLength(1);
      expect(all[0]).toEqual(record);
    });

    it('getAll returns records in chronological push order', () => {
      const first  = createMockRecord({ timestamp: 1000 });
      const second = createMockRecord({ timestamp: 2000 });
      const third  = createMockRecord({ timestamp: 3000 });

      buf.push(first);
      buf.push(second);
      buf.push(third);

      const all = buf.getAll();
      expect(all.map((r) => r.timestamp)).toEqual([1000, 2000, 3000]);
    });

    it('returns a shallow copy so mutations do not affect the internal state', () => {
      buf.push(createMockRecord());
      const snapshot = buf.getAll();
      snapshot.push(createMockRecord({ timestamp: 9999 }));

      // The buffer itself should still have only 1 record
      expect(buf.getAll()).toHaveLength(1);
    });
  });

  describe('ring buffer — maxSize enforcement', () => {
    it('evicts the oldest record when maxSize is exceeded', () => {
      const small = new TokenHistoryBuffer(3);
      small.push(createMockRecord({ timestamp: 1 }));
      small.push(createMockRecord({ timestamp: 2 }));
      small.push(createMockRecord({ timestamp: 3 }));
      small.push(createMockRecord({ timestamp: 4 })); // evicts timestamp 1

      const all = small.getAll();
      expect(all).toHaveLength(3);
      expect(all.map((r) => r.timestamp)).toEqual([2, 3, 4]);
    });

    it('retains exactly maxSize=200 records after pushing 201', () => {
      const buffer200 = new TokenHistoryBuffer(200);
      for (let i = 1; i <= 201; i++) {
        buffer200.push(createMockRecord({ timestamp: i }));
      }

      const all = buffer200.getAll();
      expect(all).toHaveLength(200);
      // Oldest surviving record should be #2 (first was evicted)
      expect(all[0].timestamp).toBe(2);
      expect(all[199].timestamp).toBe(201);
    });

    it('does not lose records before the buffer is full', () => {
      const buffer200 = new TokenHistoryBuffer(200);
      for (let i = 1; i <= 100; i++) {
        buffer200.push(createMockRecord({ timestamp: i }));
      }

      expect(buffer200.getAll()).toHaveLength(100);
    });
  });

  describe('getRecent', () => {
    it('returns the last n records in chronological order', () => {
      for (let i = 1; i <= 10; i++) {
        buf.push(createMockRecord({ timestamp: i }));
      }

      const recent = buf.getRecent(5);
      expect(recent).toHaveLength(5);
      expect(recent.map((r) => r.timestamp)).toEqual([6, 7, 8, 9, 10]);
    });

    it('returns all records when n exceeds the buffer size', () => {
      buf.push(createMockRecord({ timestamp: 1 }));
      buf.push(createMockRecord({ timestamp: 2 }));

      expect(buf.getRecent(50)).toHaveLength(2);
    });

    it('returns an empty array on an empty buffer', () => {
      expect(buf.getRecent(5)).toEqual([]);
    });

    it('returns exactly n=1 when requested', () => {
      for (let i = 1; i <= 5; i++) {
        buf.push(createMockRecord({ timestamp: i }));
      }

      const recent = buf.getRecent(1);
      expect(recent).toHaveLength(1);
      expect(recent[0].timestamp).toBe(5);
    });
  });

  describe('getSessionTotals', () => {
    it('returns all-zero totals for an empty buffer', () => {
      const totals = buf.getSessionTotals();
      expect(totals).toEqual({
        totalTokens: 0,
        totalCostUsd: 0,
        requestCount: 0,
        avgTokPerSec: 0,
        avgLatencyMs: 0,
      });
    });

    it('computes correct totals for a single record', () => {
      buf.push(createMockRecord({
        totalTokens: 600,
        estimatedCostUsd: 0.00042,
        tokensPerSecond: 30,
        latencyMs: 2000,
      }));

      const totals = buf.getSessionTotals();
      expect(totals.requestCount).toBe(1);
      expect(totals.totalTokens).toBe(600);
      expect(totals.totalCostUsd).toBeCloseTo(0.00042);
      expect(totals.avgTokPerSec).toBe(30);
      expect(totals.avgLatencyMs).toBe(2000);
    });

    it('sums totalTokens and totalCostUsd across multiple records', () => {
      buf.push(createMockRecord({ totalTokens: 300,  estimatedCostUsd: 0.001, tokensPerSecond: 20, latencyMs: 1000 }));
      buf.push(createMockRecord({ totalTokens: 700,  estimatedCostUsd: 0.003, tokensPerSecond: 40, latencyMs: 3000 }));
      buf.push(createMockRecord({ totalTokens: 1000, estimatedCostUsd: 0.005, tokensPerSecond: 60, latencyMs: 2000 }));

      const totals = buf.getSessionTotals();
      expect(totals.requestCount).toBe(3);
      expect(totals.totalTokens).toBe(2000);
      expect(totals.totalCostUsd).toBeCloseTo(0.009);
    });

    it('computes correct avgTokPerSec as the arithmetic mean', () => {
      buf.push(createMockRecord({ tokensPerSecond: 10, latencyMs: 500 }));
      buf.push(createMockRecord({ tokensPerSecond: 30, latencyMs: 500 }));
      buf.push(createMockRecord({ tokensPerSecond: 50, latencyMs: 500 }));

      // Mean of 10, 30, 50 = 30
      expect(buf.getSessionTotals().avgTokPerSec).toBeCloseTo(30);
    });

    it('computes correct avgLatencyMs as the arithmetic mean', () => {
      buf.push(createMockRecord({ latencyMs: 1000, tokensPerSecond: 10 }));
      buf.push(createMockRecord({ latencyMs: 3000, tokensPerSecond: 10 }));

      // Mean of 1000, 3000 = 2000
      expect(buf.getSessionTotals().avgLatencyMs).toBe(2000);
    });

    it('counts requests that are zero-cost (local provider) without distorting averages', () => {
      buf.push(createMockRecord({ totalTokens: 500, estimatedCostUsd: 0, tokensPerSecond: 50, latencyMs: 800 }));
      buf.push(createMockRecord({ totalTokens: 500, estimatedCostUsd: 0, tokensPerSecond: 50, latencyMs: 800 }));

      const totals = buf.getSessionTotals();
      expect(totals.totalCostUsd).toBe(0);
      expect(totals.requestCount).toBe(2);
      expect(totals.totalTokens).toBe(1000);
    });
  });

  describe('clear', () => {
    it('empties the buffer so getAll returns an empty array', () => {
      buf.push(createMockRecord());
      buf.push(createMockRecord());
      buf.clear();

      expect(buf.getAll()).toEqual([]);
    });

    it('resets session totals to zero after clear', () => {
      buf.push(createMockRecord({ totalTokens: 1000, estimatedCostUsd: 0.5 }));
      buf.clear();

      const totals = buf.getSessionTotals();
      expect(totals.requestCount).toBe(0);
      expect(totals.totalTokens).toBe(0);
      expect(totals.totalCostUsd).toBe(0);
    });

    it('accepts new records normally after being cleared', () => {
      buf.push(createMockRecord({ timestamp: 1 }));
      buf.clear();
      buf.push(createMockRecord({ timestamp: 2 }));

      const all = buf.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].timestamp).toBe(2);
    });
  });
});

/* ── estimateRequestCost ────────────────────────────────────────────────────── */

describe('estimateRequestCost', () => {
  it('returns 0 for ollama (local provider has zero pricing)', () => {
    expect(estimateRequestCost('ollama', 'llama3.2:8b', 1000, 500)).toBe(0);
  });

  it('returns a positive cost for openai', () => {
    const cost = estimateRequestCost('openai', 'gpt-4o-mini', 1000, 500);
    expect(cost).toBeGreaterThan(0);
  });

  it('returns a positive cost for anthropic', () => {
    const cost = estimateRequestCost('anthropic', 'claude-3-5-haiku-20241022', 1000, 500);
    expect(cost).toBeGreaterThan(0);
  });

  it('returns a positive cost for google', () => {
    const cost = estimateRequestCost('google', 'gemini-2.0-flash', 1000, 500);
    expect(cost).toBeGreaterThan(0);
  });

  it('cost scales proportionally with input token count', () => {
    const costA = estimateRequestCost('openai', 'gpt-4o-mini', 1000, 0);
    const costB = estimateRequestCost('openai', 'gpt-4o-mini', 2000, 0);
    expect(costB).toBeCloseTo(costA * 2);
  });

  it('cost scales proportionally with output token count', () => {
    const costA = estimateRequestCost('anthropic', 'claude-3-5-haiku-20241022', 0, 500);
    const costB = estimateRequestCost('anthropic', 'claude-3-5-haiku-20241022', 0, 1000);
    expect(costB).toBeCloseTo(costA * 2);
  });

  it('adding input and output costs produces the same result as calling once with both', () => {
    const combined   = estimateRequestCost('openai', 'gpt-4o-mini', 1000, 500);
    const inputOnly  = estimateRequestCost('openai', 'gpt-4o-mini', 1000, 0);
    const outputOnly = estimateRequestCost('openai', 'gpt-4o-mini', 0,    500);
    expect(combined).toBeCloseTo(inputOnly + outputOnly);
  });

  it('falls back to a non-zero rate for an unknown provider', () => {
    // Unknown providers use the openrouter fallback rate, which is non-zero
    const cost = estimateRequestCost('unknown-provider', 'some-model', 1000, 500);
    expect(cost).toBeGreaterThan(0);
  });

  it('returns 0 when both input and output tokens are 0', () => {
    expect(estimateRequestCost('openai', 'gpt-4o-mini', 0, 0)).toBe(0);
  });

  it('openai output tokens cost more per token than input tokens', () => {
    const inputCost  = estimateRequestCost('openai', 'gpt-4o-mini', 1000, 0);
    const outputCost = estimateRequestCost('openai', 'gpt-4o-mini', 0,    1000);
    // Output is more expensive for all major providers
    expect(outputCost).toBeGreaterThan(inputCost);
  });
});

/* ── remainingMessageEstimate ───────────────────────────────────────────────── */

describe('remainingMessageEstimate', () => {
  it('returns 0 when recentRecords is empty', () => {
    expect(remainingMessageEstimate(10000, [])).toBe(0);
  });

  it('returns 0 when remainingTokens is 0', () => {
    const records = [createMockRecord({ totalTokens: 500 })];
    expect(remainingMessageEstimate(0, records)).toBe(0);
  });

  it('returns 0 when remainingTokens is negative', () => {
    const records = [createMockRecord({ totalTokens: 500 })];
    expect(remainingMessageEstimate(-100, records)).toBe(0);
  });

  it('returns a reasonable positive estimate from recent records', () => {
    // 5 records averaging 500 tokens/request → 2500 tokens remaining → 5 messages
    const records = Array.from({ length: 5 }, () => createMockRecord({ totalTokens: 500 }));
    const estimate = remainingMessageEstimate(2500, records);
    expect(estimate).toBe(5);
  });

  it('floors the result to an integer', () => {
    // 1 record of 300 tokens, 400 remaining → 1.33 → floored to 1
    const records = [createMockRecord({ totalTokens: 300 })];
    expect(remainingMessageEstimate(400, records)).toBe(1);
  });

  it('uses only the last 5 records when more are provided', () => {
    // First record has very high tokens; only the 5 most recent (low tokens) should count
    const oldRecord = createMockRecord({ totalTokens: 100_000 });
    const recentRecords = Array.from({ length: 5 }, () => createMockRecord({ totalTokens: 500 }));

    // Pass 6 records; the service internally caps at the last 5
    const estimate = remainingMessageEstimate(2500, [oldRecord, ...recentRecords]);
    expect(estimate).toBe(5);
  });

  it('handles a single record correctly', () => {
    const records = [createMockRecord({ totalTokens: 750 })];
    expect(remainingMessageEstimate(3000, records)).toBe(4);
  });

  it('returns 0 when all recent records have zero totalTokens', () => {
    const records = [createMockRecord({ totalTokens: 0 })];
    expect(remainingMessageEstimate(1000, records)).toBe(0);
  });
});

/* ── CLOUD_PRICING ──────────────────────────────────────────────────────────── */

describe('CLOUD_PRICING', () => {
  it('contains entries for all major cloud providers', () => {
    expect(CLOUD_PRICING).toHaveProperty('openai');
    expect(CLOUD_PRICING).toHaveProperty('anthropic');
    expect(CLOUD_PRICING).toHaveProperty('google');
    expect(CLOUD_PRICING).toHaveProperty('openrouter');
  });

  it('has zero rates for ollama (local provider)', () => {
    expect(CLOUD_PRICING['ollama'].inputPer1k).toBe(0);
    expect(CLOUD_PRICING['ollama'].outputPer1k).toBe(0);
  });

  it('all cloud provider entries have non-negative rates', () => {
    for (const [providerId, rates] of Object.entries(CLOUD_PRICING)) {
      expect(rates.inputPer1k, `${providerId} inputPer1k`).toBeGreaterThanOrEqual(0);
      expect(rates.outputPer1k, `${providerId} outputPer1k`).toBeGreaterThanOrEqual(0);
    }
  });
});

/* ── sessionTokenHistory singleton ─────────────────────────────────────────── */

describe('sessionTokenHistory singleton', () => {
  beforeEach(() => {
    // Reset the shared singleton between tests so they are fully isolated
    sessionTokenHistory.clear();
  });

  it('is a TokenHistoryBuffer instance', () => {
    expect(sessionTokenHistory).toBeInstanceOf(TokenHistoryBuffer);
  });

  it('starts empty after clear', () => {
    expect(sessionTokenHistory.getAll()).toEqual([]);
  });

  it('accepts pushes and reflects them in getSessionTotals', () => {
    sessionTokenHistory.push(createMockRecord({ totalTokens: 300, estimatedCostUsd: 0 }));
    sessionTokenHistory.push(createMockRecord({ totalTokens: 700, estimatedCostUsd: 0 }));

    expect(sessionTokenHistory.getSessionTotals().requestCount).toBe(2);
    expect(sessionTokenHistory.getSessionTotals().totalTokens).toBe(1000);
  });
});
