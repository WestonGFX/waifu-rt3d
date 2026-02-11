import { useCallback, useEffect, useMemo, useState } from 'react';

import { fetchMemoryGraph } from '../lib/api';
import { normalizeMemoryPayload } from '../lib/memory';
import { microcopy } from '../lib/microcopy';
import type { MemoryGraphPayload } from '../types';

interface MemoryGraphProps {
  sessionId: number;
  charId: number;
}

const fallbackPayload: MemoryGraphPayload = {
  mode: 'session',
  nodes: [],
  edges: [],
  stats: {
    sessionMessages: 0,
    memoryHits: 0,
    ragAvailable: false
  }
};

export function MemoryGraph({ sessionId, charId }: MemoryGraphProps) {
  const [payload, setPayload] = useState<MemoryGraphPayload>(fallbackPayload);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (trigger: 'initial' | 'refresh' | 'poll') => {
      if (trigger === 'initial') {
        setLoading(true);
      }
      if (trigger === 'refresh') {
        setRefreshing(true);
      }

      try {
        const result = await fetchMemoryGraph(sessionId, charId, 30);
        setPayload(normalizeMemoryPayload(result));
        setError(null);
      } catch {
        setPayload((prev) => ({ ...prev, mode: 'session' }));
        setError(microcopy.errors.memoryFailed);
      } finally {
        if (trigger === 'initial') {
          setLoading(false);
        }
        if (trigger === 'refresh') {
          setRefreshing(false);
        }
      }
    },
    [sessionId, charId]
  );

  useEffect(() => {
    let active = true;

    const run = async () => {
      if (!active) return;
      await load('initial');
    };

    void run();

    const interval = window.setInterval(() => {
      if (!active) return;
      void load('poll');
    }, 6000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [load]);

  const statusLabel = useMemo(() => {
    if (error) return microcopy.status.memoryOffline;
    if (loading) return microcopy.status.memorySyncing;
    return payload.mode === 'rag' ? microcopy.status.memoryRag : microcopy.status.memorySession;
  }, [error, loading, payload.mode]);

  const empty = !loading && !error && payload.nodes.length === 0;

  return (
    <section className="v2-memory-wrap">
      <header>
        <h3>Memory Bank</h3>
        <div className="v2-memory-header-right">
          <p>{statusLabel}</p>
          <button
            type="button"
            className="v2-memory-refresh"
            disabled={refreshing || loading}
            onClick={() => {
              void load('refresh');
            }}
          >
            {refreshing ? `${microcopy.status.memorySyncing}...` : microcopy.actions.refresh}
          </button>
        </div>
      </header>

      {error ? <p className="v2-memory-error">{error}</p> : null}

      {empty ? (
        <p className="v2-memory-empty">{microcopy.status.memoryEmpty}</p>
      ) : (
        <svg className="v2-memory-graph" viewBox="0 0 360 280" role="img" aria-label="Memory graph">
          {payload.edges.map((edge) => {
            const source = payload.nodes.find((node) => node.id === edge.source);
            const target = payload.nodes.find((node) => node.id === edge.target);
            if (!source || !target) return null;
            return (
              <line
                key={edge.id}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                className={edge.kind === 'retrieval' ? 'retrieval' : 'sequence'}
              />
            );
          })}

          {payload.nodes.map((node) => (
            <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
              <circle className={node.role} r={node.role === 'memory' ? 8 : 10} />
              <text x={14} y={4}>
                {node.label.slice(0, 20)}
              </text>
            </g>
          ))}
        </svg>
      )}

      <footer>
        <span>Messages: {payload.stats.sessionMessages}</span>
        <span>Hits: {payload.stats.memoryHits}</span>
      </footer>
    </section>
  );
}
