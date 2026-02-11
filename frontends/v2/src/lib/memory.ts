import type { MemoryGraphPayload } from '../types';

export function normalizeMemoryPayload(payload: Partial<MemoryGraphPayload>): MemoryGraphPayload {
  return {
    mode: payload.mode === 'rag' ? 'rag' : 'session',
    nodes: Array.isArray(payload.nodes) ? payload.nodes : [],
    edges: Array.isArray(payload.edges) ? payload.edges : [],
    stats: {
      sessionMessages: payload.stats?.sessionMessages ?? 0,
      memoryHits: payload.stats?.memoryHits ?? 0,
      ragAvailable: payload.stats?.ragAvailable ?? false
    }
  };
}
