/**
 * Tests for embeddingService — pure math functions only.
 * Network-dependent functions (generateEmbedding, isEmbeddingAvailable)
 * are excluded; they require a live Ollama instance.
 */

import { describe, it, expect } from 'vitest';
import {
  cosineSimilarity,
  semanticScore,
  computeRecencyDecay,
} from './embeddingService.ts';

// ---------------------------------------------------------------------------
// cosineSimilarity
// ---------------------------------------------------------------------------

describe('cosineSimilarity', () => {
  it('returns 1.0 for identical non-zero vectors', () => {
    const v = [1, 2, 3, 4, 5];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 10);
  });

  it('returns 1.0 for identical unit vectors', () => {
    const v = [1, 0, 0];
    expect(cosineSimilarity(v, v)).toBe(1);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBe(0);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it('returns -1 for exactly opposite vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [-1, 0, 0])).toBeCloseTo(-1, 10);
    expect(cosineSimilarity([3, 4], [-3, -4])).toBeCloseTo(-1, 10);
  });

  it('returns 0 when the first vector is all zeros', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  it('returns 0 when the second vector is all zeros', () => {
    expect(cosineSimilarity([1, 2, 3], [0, 0, 0])).toBe(0);
  });

  it('returns 0 when both vectors are zero vectors', () => {
    expect(cosineSimilarity([0, 0, 0], [0, 0, 0])).toBe(0);
  });

  it('returns a value in [-1, 1] for arbitrary unit vectors', () => {
    const a = [0.6, 0.8];
    const b = [0.8, 0.6];
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeGreaterThanOrEqual(-1);
    expect(sim).toBeLessThanOrEqual(1);
  });

  it('returns a value in [-1, 1] for arbitrary scaled vectors', () => {
    const a = [100, 200, 300];
    const b = [1, -1, 0];
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeGreaterThanOrEqual(-1);
    expect(sim).toBeLessThanOrEqual(1);
  });

  it('handles single-element vectors', () => {
    expect(cosineSimilarity([5], [5])).toBeCloseTo(1, 10);
    expect(cosineSimilarity([5], [-5])).toBeCloseTo(-1, 10);
  });

  it('uses the shorter length when vectors have mismatched sizes', () => {
    // Implementation takes Math.min(a.length, b.length).
    // [1,0,0] vs [1,0] — the dot product over len=2 is 1, mag both = 1 → sim = 1.
    const sim = cosineSimilarity([1, 0, 0], [1, 0]);
    expect(sim).toBeCloseTo(1, 10);
  });

  it('returns a positive similarity for nearly-parallel vectors', () => {
    const a = [1, 1, 1];
    const b = [2, 2, 2];
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 10);
  });

  it('returns a negative similarity for mostly-opposite vectors', () => {
    const a = [1, 0, 0];
    const b = [-0.99, 0.1, 0.1];
    expect(cosineSimilarity(a, b)).toBeLessThan(0);
  });
});

// ---------------------------------------------------------------------------
// semanticScore
// ---------------------------------------------------------------------------

describe('semanticScore', () => {
  it('combines similarity * 2, salience, and recencyDecay * 0.5 correctly', () => {
    const queryVec = [1, 0, 0];
    const memVec = [1, 0, 0]; // cosine = 1.0
    const salience = 0.8;
    const recencyDecay = 0.9;

    // Expected: 1.0 * 2 + 0.8 + 0.9 * 0.5 = 2 + 0.8 + 0.45 = 3.25
    const score = semanticScore(queryVec, memVec, salience, recencyDecay);
    expect(score).toBeCloseTo(3.25, 10);
  });

  it('scores orthogonal vectors lower than similar vectors at the same salience/recency', () => {
    const queryVec = [1, 0, 0];
    const similarVec = [1, 0, 0];
    const orthogonalVec = [0, 1, 0];
    const salience = 0.5;
    const recency = 0.5;

    const highScore = semanticScore(queryVec, similarVec, salience, recency);
    const lowScore = semanticScore(queryVec, orthogonalVec, salience, recency);
    expect(highScore).toBeGreaterThan(lowScore);
  });

  it('produces higher score for higher salience when vectors are equal', () => {
    const q = [1, 0];
    const m = [1, 0];
    const recency = 0.5;

    const lowSalienceScore = semanticScore(q, m, 0.3, recency);
    const highSalienceScore = semanticScore(q, m, 0.9, recency);
    expect(highSalienceScore).toBeGreaterThan(lowSalienceScore);
  });

  it('produces higher score for fresher recency when vectors and salience are equal', () => {
    const q = [1, 0];
    const m = [1, 0];
    const salience = 0.7;

    const staleScore = semanticScore(q, m, salience, 0.1);
    const freshScore = semanticScore(q, m, salience, 1.0);
    expect(freshScore).toBeGreaterThan(staleScore);
  });

  it('handles zero-vector gracefully — returns salience + recencyDecay * 0.5', () => {
    const zeroVec = [0, 0, 0];
    const anyVec = [1, 0, 0];
    const salience = 0.6;
    const recency = 0.8;

    // cosineSimilarity returns 0 for a zero vector.
    const expected = 0 * 2 + salience + recency * 0.5;
    expect(semanticScore(zeroVec, anyVec, salience, recency)).toBeCloseTo(expected, 10);
  });

  it('can return negative scores when vectors are opposite and salience/recency are low', () => {
    const q = [1, 0];
    const m = [-1, 0]; // cosine = -1
    const salience = 0.3;
    const recency = 0.05; // minimum recency decay

    // -1 * 2 + 0.3 + 0.05 * 0.5 = -2 + 0.3 + 0.025 = -1.675
    const score = semanticScore(q, m, salience, recency);
    expect(score).toBeLessThan(0);
  });
});

// ---------------------------------------------------------------------------
// computeRecencyDecay
// ---------------------------------------------------------------------------

describe('computeRecencyDecay', () => {
  const NOW = 1_700_000_000_000; // Fixed reference timestamp.

  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  const WEEK = 7 * DAY;
  const MONTH = 30 * DAY;
  const THREE_MONTHS = 90 * DAY;

  it('returns 1.0 for a very fresh memory (just created)', () => {
    expect(computeRecencyDecay(NOW, NOW)).toBe(1.0);
  });

  it('returns 1.0 for a memory created less than 1 hour ago', () => {
    expect(computeRecencyDecay(NOW - HOUR + 1, NOW)).toBe(1.0);
    expect(computeRecencyDecay(NOW - HOUR / 2, NOW)).toBe(1.0);
    expect(computeRecencyDecay(NOW - 1, NOW)).toBe(1.0);
  });

  it('returns exactly 1.0 at the 1-hour anchor', () => {
    expect(computeRecencyDecay(NOW - HOUR, NOW)).toBe(1.0);
  });

  it('returns approximately 0.8 for a memory created exactly 1 day ago', () => {
    expect(computeRecencyDecay(NOW - DAY, NOW)).toBeCloseTo(0.8, 5);
  });

  it('returns a value between 1.0 and 0.8 for ages between 1 hour and 1 day', () => {
    const midAge = HOUR + (DAY - HOUR) / 2;
    const weight = computeRecencyDecay(NOW - midAge, NOW);
    expect(weight).toBeGreaterThan(0.8);
    expect(weight).toBeLessThan(1.0);
  });

  it('returns approximately 0.5 for a memory created exactly 1 week ago', () => {
    expect(computeRecencyDecay(NOW - WEEK, NOW)).toBeCloseTo(0.5, 5);
  });

  it('returns a value between 0.8 and 0.5 for ages between 1 day and 1 week', () => {
    const midAge = DAY + (WEEK - DAY) / 2;
    const weight = computeRecencyDecay(NOW - midAge, NOW);
    expect(weight).toBeGreaterThan(0.5);
    expect(weight).toBeLessThan(0.8);
  });

  it('returns approximately 0.2 for a memory created exactly 1 month ago', () => {
    expect(computeRecencyDecay(NOW - MONTH, NOW)).toBeCloseTo(0.2, 5);
  });

  it('returns a value between 0.5 and 0.2 for ages between 1 week and 1 month', () => {
    const midAge = WEEK + (MONTH - WEEK) / 2;
    const weight = computeRecencyDecay(NOW - midAge, NOW);
    expect(weight).toBeGreaterThan(0.2);
    expect(weight).toBeLessThan(0.5);
  });

  it('clamps to 0.05 at exactly 3 months', () => {
    expect(computeRecencyDecay(NOW - THREE_MONTHS, NOW)).toBe(0.05);
  });

  it('clamps to 0.05 for very old memories beyond 3 months', () => {
    expect(computeRecencyDecay(NOW - THREE_MONTHS * 2, NOW)).toBe(0.05);
    expect(computeRecencyDecay(0, NOW)).toBe(0.05);
  });

  it('returns a value between 0.2 and 0.05 for ages between 1 month and 3 months', () => {
    const midAge = MONTH + (THREE_MONTHS - MONTH) / 2;
    const weight = computeRecencyDecay(NOW - midAge, NOW);
    expect(weight).toBeGreaterThan(0.05);
    expect(weight).toBeLessThan(0.2);
  });

  it('never returns a value less than 0.05', () => {
    // Extremely old memory (1 year).
    const oneYear = 365 * DAY;
    expect(computeRecencyDecay(NOW - oneYear, NOW)).toBeGreaterThanOrEqual(0.05);
  });

  it('never returns a value greater than 1.0', () => {
    expect(computeRecencyDecay(NOW, NOW)).toBeLessThanOrEqual(1.0);
    // Future createdAt (defensive: age clamped to 0 by Math.max).
    expect(computeRecencyDecay(NOW + DAY, NOW)).toBeLessThanOrEqual(1.0);
  });

  it('uses Date.now() as the default reference when now is omitted', () => {
    // A memory created just now should score at or very near 1.0.
    const weight = computeRecencyDecay(Date.now());
    expect(weight).toBeGreaterThanOrEqual(0.05);
    expect(weight).toBeLessThanOrEqual(1.0);
  });

  it('returns a monotonically non-increasing value as age increases', () => {
    const ages = [0, HOUR / 2, HOUR, DAY / 2, DAY, WEEK / 2, WEEK, MONTH / 2, MONTH, THREE_MONTHS];
    const weights = ages.map((age) => computeRecencyDecay(NOW - age, NOW));
    for (let i = 1; i < weights.length; i++) {
      expect(weights[i]).toBeLessThanOrEqual(weights[i - 1] + 1e-10);
    }
  });
});
