import { useEffect, useMemo, useState } from 'react';

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

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const result = await fetchMemoryGraph(sessionId, charId, 30);
        if (!mounted) return;
        setPayload(normalizeMemoryPayload(result));
        setError(null);
      } catch {
        if (!mounted) return;
        setPayload((prev) => ({ ...prev, mode: 'session' }));
        setError(microcopy.errors.memoryFailed);
      }
    };

    load();
    const interval = window.setInterval(load, 6000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [sessionId, charId]);

  const statusLabel = useMemo(() => {
    if (error) return microcopy.status.memoryOffline;
    return payload.mode === 'rag' ? microcopy.status.memoryRag : microcopy.status.memorySession;
  }, [error, payload.mode]);

  return (
    <section className="v2-memory-wrap">
      <header>
        <h3>Memory Bank</h3>
        <p>{statusLabel}</p>
      </header>

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

      <footer>
        <span>Messages: {payload.stats.sessionMessages}</span>
        <span>Hits: {payload.stats.memoryHits}</span>
      </footer>
    </section>
  );
}
