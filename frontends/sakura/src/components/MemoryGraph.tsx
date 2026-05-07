/**
 * MemoryGraph — SVG radial mind map for the Memory Browser graph tab.
 *
 * Fetches up to 50 memories for the active character and renders them in
 * three concentric rings, one ring per tier:
 *   T3 Permanent  → inner ring  (amber, larger nodes)
 *   T2 Recent     → middle ring (accent, medium nodes)
 *   T1 Fleeting   → outer ring  (muted, smaller nodes)
 *
 * Node radius is proportional to salience (0–1). Hover shows a tooltip
 * with the full memory text. Same-session memories are connected by a thin
 * edge so clusters of related memories are visible.
 *
 * No external graph libraries — pure SVG + React.
 *
 * @module MemoryGraph
 */

import { useState, useEffect, useRef } from 'react';
import { Brain, Loader2 } from 'lucide-react';
import { api, type MemoryItem } from '../lib/api';

const TIER_COLOR: Record<number, string> = {
  1: 'var(--color-text-tertiary)',
  2: 'var(--color-accent)',
  3: '#f59e0b',
};

const TIER_FILL: Record<number, string> = {
  1: 'rgba(120,120,140,0.15)',
  2: 'color-mix(in srgb, var(--color-accent) 18%, transparent)',
  3: 'rgba(245,158,11,0.18)',
};

const TIER_LABEL: Record<number, string> = { 1: 'Fleeting', 2: 'Recent', 3: 'Permanent' };

/** Radii for each tier ring. */
const RING_R: Record<number, number> = { 3: 82, 2: 150, 1: 218 };

/** Max nodes shown per ring to avoid crowding. */
const RING_MAX: Record<number, number> = { 3: 10, 2: 14, 1: 18 };

/** Node radius: salience * scale + base. */
const nodeR = (salience?: number, tier = 1): number => {
  const base = tier === 3 ? 7 : tier === 2 ? 5.5 : 4;
  const scale = tier === 3 ? 5 : tier === 2 ? 4 : 3;
  return base + (salience ?? 0.5) * scale;
};

interface NodeDatum {
  mem: MemoryItem;
  x: number;
  y: number;
  r: number;
}

interface Edge {
  x1: number; y1: number;
  x2: number; y2: number;
}

/**
 * Lay out nodes on a ring at a given radius, evenly spaced by angle.
 *
 * @param mems - Memories to place.
 * @param radius - Ring radius from centre.
 * @param cx - SVG centre x.
 * @param cy - SVG centre y.
 */
function ringLayout(mems: MemoryItem[], radius: number, cx: number, cy: number): NodeDatum[] {
  return mems.map((mem, i) => {
    const angle = (2 * Math.PI * i) / mems.length - Math.PI / 2;
    return {
      mem,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
      r: nodeR(mem.salience, mem.tier),
    };
  });
}

/**
 * Memory mind map for the Memory Browser graph tab.
 *
 * @param charId   - Active character ID.
 * @param charName - Character display name.
 */
export function MemoryGraph({ charId, charName }: { charId: number; charName: string }) {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<{ node: NodeDatum; mouseX: number; mouseY: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    setLoading(true);
    api.listMemories(charId, 0, 50)
      .then(d => setMemories(d.memories || []))
      .catch(() => setMemories([]))
      .finally(() => setLoading(false));
  }, [charId]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-tertiary)' }}>
        <Loader2 size={20} className="animate-spin" style={{ margin: '0 auto 8px' }} />
        <p style={{ fontSize: '0.8rem' }}>Building memory map...</p>
      </div>
    );
  }

  if (memories.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-tertiary)' }}>
        <Brain size={28} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
        <p style={{ fontSize: '0.85rem' }}>No memories to visualize yet.</p>
        <p style={{ fontSize: '0.75rem', marginTop: 4 }}>Chat more to build a mind map.</p>
      </div>
    );
  }

  const W = 440;
  const H = 440;
  const cx = W / 2;
  const cy = H / 2;

  // Group by tier, cap per ring.
  const byTier: Record<number, MemoryItem[]> = { 1: [], 2: [], 3: [] };
  for (const m of memories) {
    const t = m.tier ?? 1;
    if (byTier[t] && byTier[t].length < RING_MAX[t]) byTier[t].push(m);
  }

  // Build node data.
  const t3nodes = ringLayout(byTier[3], RING_R[3], cx, cy);
  const t2nodes = ringLayout(byTier[2], RING_R[2], cx, cy);
  const t1nodes = ringLayout(byTier[1], RING_R[1], cx, cy);
  const allNodes = [...t3nodes, ...t2nodes, ...t1nodes];

  // Connect memories from the same session with thin edges.
  const sessionMap: Record<string, NodeDatum[]> = {};
  for (const n of allNodes) {
    const sid = String(n.mem.session_id ?? 'none');
    if (sid !== 'none') {
      if (!sessionMap[sid]) sessionMap[sid] = [];
      sessionMap[sid].push(n);
    }
  }
  const edges: Edge[] = [];
  for (const nodes of Object.values(sessionMap)) {
    for (let i = 1; i < nodes.length; i++) {
      edges.push({ x1: nodes[0].x, y1: nodes[0].y, x2: nodes[i].x, y2: nodes[i].y });
    }
  }

  /** Truncate for node label. */
  const label = (text: string, maxLen = 18) => text.length > maxLen ? text.slice(0, maxLen) + '…' : text;

  const handleMouseEnter = (node: NodeDatum, e: React.MouseEvent<SVGCircleElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    setTooltip({
      node,
      mouseX: e.clientX - (rect?.left ?? 0),
      mouseY: e.clientY - (rect?.top ?? 0),
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        {[3, 2, 1].map(tier => (
          <div key={tier} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.65rem', color: 'var(--color-text-tertiary)' }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              backgroundColor: TIER_COLOR[tier],
              opacity: 0.85,
            }} />
            T{tier} {TIER_LABEL[tier]} ({byTier[tier].length})
          </div>
        ))}
      </div>

      {/* SVG mind map */}
      <div
        style={{
          position: 'relative',
          borderRadius: 12,
          overflow: 'hidden',
          backgroundColor: 'var(--color-background)',
          border: '1px solid var(--color-border-subtle)',
        }}
        onMouseLeave={() => setTooltip(null)}
      >
        <svg
          ref={svgRef}
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          style={{ display: 'block', width: '100%', height: 'auto' }}
        >
          {/* Ring guides (faint circles) */}
          {[3, 2, 1].map(tier => (
            <circle
              key={tier}
              cx={cx} cy={cy}
              r={RING_R[tier]}
              fill="none"
              stroke={TIER_COLOR[tier]}
              strokeOpacity={0.08}
              strokeDasharray="4 6"
            />
          ))}

          {/* Session edges */}
          {edges.map((e, i) => (
            <line
              key={i}
              x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
              stroke="var(--color-border-subtle)"
              strokeOpacity={0.4}
              strokeWidth={0.8}
            />
          ))}

          {/* Memory nodes */}
          {allNodes.map((n, i) => {
            const tier = n.mem.tier ?? 1;
            const isHovered = tooltip?.node === n;
            return (
              <g key={i}>
                {/* Glow ring on hover */}
                {isHovered && (
                  <circle cx={n.x} cy={n.y} r={n.r + 5} fill={TIER_FILL[tier]} stroke={TIER_COLOR[tier]} strokeOpacity={0.4} strokeWidth={1} />
                )}
                <circle
                  cx={n.x} cy={n.y} r={n.r}
                  fill={TIER_FILL[tier]}
                  stroke={TIER_COLOR[tier]}
                  strokeWidth={1.2}
                  strokeOpacity={isHovered ? 1 : 0.75}
                  style={{ cursor: 'pointer', transition: 'stroke-opacity 0.15s' }}
                  onMouseEnter={(e) => handleMouseEnter(n, e)}
                />
                {/* Label (only for T3/T2 with enough space) */}
                {tier >= 2 && (
                  <text
                    x={n.x} y={n.y + n.r + 9}
                    textAnchor="middle"
                    fontSize="6"
                    fill={TIER_COLOR[tier]}
                    fillOpacity={0.7}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {label(n.mem.text, 16)}
                  </text>
                )}
              </g>
            );
          })}

          {/* Centre node */}
          <circle cx={cx} cy={cy} r={24} fill="color-mix(in srgb, var(--color-accent) 15%, transparent)" stroke="var(--color-accent)" strokeWidth={1.5} strokeOpacity={0.6} />
          <text x={cx} y={cy - 6} textAnchor="middle" fontSize="9" fontWeight={600} fill="var(--color-accent)" fillOpacity={0.85} style={{ userSelect: 'none' }}>🧠</text>
          <text x={cx} y={cy + 7} textAnchor="middle" fontSize="7" fill="var(--color-text-tertiary)" style={{ userSelect: 'none' }}>
            {charName.length > 10 ? charName.slice(0, 10) + '…' : charName}
          </text>
          <text x={cx} y={cy + 16} textAnchor="middle" fontSize="6" fill="var(--color-text-tertiary)" fillOpacity={0.6} style={{ userSelect: 'none' }}>
            {memories.length} mem
          </text>
        </svg>

        {/* Tooltip */}
        {tooltip && (
          <div
            style={{
              position: 'absolute',
              left: Math.min(tooltip.mouseX + 12, W - 180),
              top: Math.max(tooltip.mouseY - 60, 4),
              width: 170,
              padding: '6px 8px',
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              zIndex: 10,
              pointerEvents: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
              <span style={{
                fontSize: '0.55rem', fontWeight: 700, padding: '0 4px', borderRadius: 3,
                color: TIER_COLOR[tooltip.node.mem.tier ?? 1],
                border: `1px solid ${TIER_COLOR[tooltip.node.mem.tier ?? 1]}`,
              }}>
                T{tooltip.node.mem.tier ?? 1} {TIER_LABEL[tooltip.node.mem.tier ?? 1]}
              </span>
              {tooltip.node.mem.salience != null && (
                <span style={{ fontSize: '0.55rem', color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>
                  salience {(tooltip.node.mem.salience * 100).toFixed(0)}%
                </span>
              )}
            </div>
            <p style={{ fontSize: '0.72rem', color: 'var(--color-text-primary)', lineHeight: 1.45, wordBreak: 'break-word' }}>
              {tooltip.node.mem.text.slice(0, 180)}
              {tooltip.node.mem.text.length > 180 && '…'}
            </p>
            {tooltip.node.mem.created_at && (
              <p style={{ fontSize: '0.58rem', color: 'var(--color-text-tertiary)', marginTop: 4 }}>
                {new Date(tooltip.node.mem.created_at).toLocaleDateString()}
              </p>
            )}
          </div>
        )}
      </div>

      <p style={{ fontSize: '0.65rem', color: 'var(--color-text-tertiary)', textAlign: 'center' }}>
        Hover nodes to read · Lines connect same-session memories · Up to 42 shown
      </p>
    </div>
  );
}
