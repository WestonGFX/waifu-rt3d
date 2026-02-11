import { describe, expect, it } from 'vitest';

import { normalizeMemoryPayload } from './memory';

describe('normalizeMemoryPayload', () => {
  it('normalizes missing fields with safe defaults', () => {
    const normalized = normalizeMemoryPayload({});

    expect(normalized.mode).toBe('session');
    expect(normalized.nodes).toEqual([]);
    expect(normalized.edges).toEqual([]);
    expect(normalized.stats.sessionMessages).toBe(0);
    expect(normalized.stats.memoryHits).toBe(0);
    expect(normalized.stats.ragAvailable).toBe(false);
  });

  it('preserves valid payload values', () => {
    const normalized = normalizeMemoryPayload({
      mode: 'rag',
      nodes: [{ id: 'n1', label: 'x', role: 'memory', x: 10, y: 10 }],
      edges: [{ id: 'e1', source: 'n1', target: 'n1', kind: 'retrieval' }],
      stats: { sessionMessages: 1, memoryHits: 2, ragAvailable: true }
    });

    expect(normalized.mode).toBe('rag');
    expect(normalized.nodes).toHaveLength(1);
    expect(normalized.edges).toHaveLength(1);
    expect(normalized.stats.memoryHits).toBe(2);
  });
});
