import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Network } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import type { Character } from '../lib/types';

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

/** Internal representation of a graph node (character + fetched affinity). */
interface CharNode {
  char: Character;
  /** Affinity 0-1, or null while loading / on error. */
  affinity: number | null;
}

/** Computed 2D position within the SVG canvas. */
interface NodePos {
  x: number;
  y: number;
}

/* ═══════════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════════ */

/** Diameter of the SVG canvas in pixels (panel is 520px wide). */
const SVG_SIZE = 460;
/** Centre point of the circular layout. */
const CX = SVG_SIZE / 2;
const CY = SVG_SIZE / 2;
/** Radius of the orbit on which nodes are placed. */
const ORBIT_R = 160;
/** Min and max node circle radii, mapped from affinity 0-1. */
const NODE_R_MIN = 24;
const NODE_R_MAX = 48;

/* ═══════════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Map an affinity score (0-1) to a human-readable tier label.
 *
 * @param affinity - Normalised affinity value.
 * @returns Tier label string.
 */
function affinityTier(affinity: number): 'Devoted' | 'Close' | 'Friendly' | 'Neutral' | 'Stranger' {
  const pct = affinity * 100;
  if (pct >= 80) return 'Devoted';
  if (pct >= 60) return 'Close';
  if (pct >= 40) return 'Friendly';
  if (pct >= 20) return 'Neutral';
  return 'Stranger';
}

/**
 * Return a fill color for a node based on the character's affinity tier.
 * Green = Devoted/Close, yellow = Friendly/Neutral, grey = Stranger/unknown.
 *
 * @param affinity - Normalised affinity score, or null if not yet fetched.
 * @returns CSS color string.
 */
function nodeColor(affinity: number | null): string {
  if (affinity == null) return '#64748b'; // grey — loading
  const tier = affinityTier(affinity);
  switch (tier) {
    case 'Devoted':  return '#e879a0'; // pink
    case 'Close':    return '#34d399'; // green
    case 'Friendly': return '#86efac'; // light green
    case 'Neutral':  return '#fbbf24'; // yellow
    default:         return '#94a3b8'; // grey
  }
}

/**
 * Map an affinity score to a node circle radius.
 * Characters with higher affinity are drawn larger (range: 24–48px).
 *
 * @param affinity - Normalised affinity score, or null.
 * @returns Radius in pixels.
 */
function nodeRadius(affinity: number | null): number {
  if (affinity == null) return NODE_R_MIN;
  return Math.round(NODE_R_MIN + affinity * (NODE_R_MAX - NODE_R_MIN));
}

/**
 * Compute evenly-spaced 2D positions on a circle for `n` nodes.
 * When only one node exists it is placed at the centre.
 *
 * @param n - Number of nodes.
 * @returns Array of {x, y} positions matching the input index.
 */
function computeCircularLayout(n: number): NodePos[] {
  if (n === 0) return [];
  if (n === 1) return [{ x: CX, y: CY }];
  return Array.from({ length: n }, (_, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2; // start at top
    return {
      x: CX + ORBIT_R * Math.cos(angle),
      y: CY + ORBIT_R * Math.sin(angle),
    };
  });
}

/**
 * Truncate a character name to fit beneath a node label area (max ~10 chars).
 *
 * @param name - Full character name.
 * @returns Truncated name with ellipsis if over the limit.
 */
function truncateName(name: string): string {
  return name.length > 11 ? name.slice(0, 10) + '…' : name;
}

/* ═══════════════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Right slide-out panel displaying a visual relationship web for all known
 * characters, rendered as an SVG circular graph.
 *
 * Layout:
 * - Characters are evenly distributed on a circle (no physics engine required).
 * - Each node is a circle whose radius (24–48px) scales with the affinity score.
 * - Node fill color indicates the affinity tier:
 *   - Pink: Devoted (≥80%)
 *   - Green: Close (≥60%)
 *   - Light green: Friendly (≥40%)
 *   - Yellow: Neutral (≥20%)
 *   - Grey: Stranger (<20%) or data not yet fetched
 * - Character name is rendered beneath each node.
 * - Clicking a node selects that character and closes the overlay.
 * - Affinity data is fetched in parallel for all characters via
 *   GET /api/relationships/{charId}.
 *
 * This component intentionally avoids drawing edges between nodes because
 * the graph represents user↔character relationships, not character↔character
 * social links.
 *
 * Overlay key: 'relweb'
 */
export function CharacterRelationshipWeb() {
  const { closeOverlay, characters, selectCharacter } = useAppStore();
  const open = false; // overlay removed

  const [nodes, setNodes] = useState<CharNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  // Fetch affinity data for all characters when the panel opens
  useEffect(() => {
    if (!open || characters.length === 0) return;

    // Initialise nodes with null affinity; fill in as each fetch resolves
    const initial: CharNode[] = characters.map(c => ({ char: c, affinity: null }));
    setNodes(initial);
    setLoading(true);

    let outstanding = characters.length;

    characters.forEach(char => {
      fetch(`/api/characters/${char.id}/relationship`)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((data: unknown) => {
          // Accept both flat affinity fields and nested objects
          let affinity: number | null = null;
          if (data && typeof data === 'object') {
            const d = data as Record<string, unknown>;
            const raw = d['affinity'] ?? d['score'] ?? null;
            if (typeof raw === 'number') affinity = raw;
          }
          setNodes(prev =>
            prev.map(n =>
              n.char.id === char.id ? { ...n, affinity } : n,
            ),
          );
        })
        .catch(() => {
          // Leave affinity as null; node will render in grey
        })
        .finally(() => {
          outstanding -= 1;
          if (outstanding <= 0) setLoading(false);
        });
    });
  }, [open, characters]);

  // Reset nodes when panel closes so stale data is not shown on re-open
  useEffect(() => {
    if (!open) {
      setNodes([]);
      setLoading(false);
      setHoveredId(null);
    }
  }, [open]);

  /**
   * Handle clicking a character node: select the character in global state
   * and close the overlay so the chat thread is revealed.
   *
   * @param char - The character whose node was clicked.
   */
  const handleNodeClick = (char: Character) => {
    selectCharacter(char);
    closeOverlay();
  };

  const positions = computeCircularLayout(nodes.length);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="relweb-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={closeOverlay}
            style={{
              position: 'fixed', inset: 0,
              backgroundColor: 'rgba(0,0,0,0.45)',
              zIndex: 40,
            }}
          />

          {/* Panel */}
          <motion.div
            key="relweb-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Character relationship web"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            style={{
              position: 'fixed', top: 0, right: 0, bottom: 0,
              width: 'min(520px, 94vw)',
              backgroundColor: 'var(--color-background)',
              borderLeft: '1px solid var(--color-border)',
              boxShadow: '-8px 0 32px rgba(0,0,0,0.3)',
              zIndex: 50,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* ── Header ── */}
            <div
              style={{
                padding: '16px 20px 14px',
                borderBottom: '1px solid var(--color-border)',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <Network size={16} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
              <span
                style={{
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  letterSpacing: '0.06em',
                  color: 'var(--color-text-primary)',
                }}
              >
                RELATIONSHIP WEB
              </span>
              {loading && (
                <span
                  style={{
                    fontSize: '0.7rem',
                    color: 'var(--color-text-tertiary)',
                    marginLeft: 4,
                  }}
                >
                  Loading…
                </span>
              )}
              <button
                onClick={closeOverlay}
                style={{
                  marginLeft: 'auto',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-text-tertiary)',
                  padding: '4px',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Close"
                aria-label="Close relationship web"
              >
                <X size={16} />
              </button>
            </div>

            {/* ── Content ── */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '16px 20px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              {/* Empty state — no characters */}
              {!loading && characters.length === 0 && (
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px',
                    padding: '40px 20px',
                    textAlign: 'center',
                  }}
                >
                  <span style={{ fontSize: '2.5rem', lineHeight: 1, opacity: 0.4 }}>🕸️</span>
                  <p
                    style={{
                      color: 'var(--color-text-secondary)',
                      fontSize: '0.88rem',
                      fontWeight: 500,
                      margin: 0,
                    }}
                  >
                    No characters yet
                  </p>
                  <p
                    style={{
                      color: 'var(--color-text-tertiary)',
                      fontSize: '0.75rem',
                      maxWidth: '260px',
                      lineHeight: 1.5,
                      margin: 0,
                    }}
                  >
                    Create some characters to see your relationship web.
                  </p>
                </div>
              )}

              {/* SVG graph */}
              {nodes.length > 0 && (
                <>
                  <svg
                    width={SVG_SIZE}
                    height={SVG_SIZE}
                    viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
                    style={{
                      width: '100%',
                      maxWidth: SVG_SIZE,
                      height: 'auto',
                      display: 'block',
                      margin: '0 auto',
                    }}
                    aria-label="Relationship web graph"
                  >
                    {/* Subtle guide circle to hint at the orbital layout */}
                    <circle
                      cx={CX}
                      cy={CY}
                      r={ORBIT_R}
                      fill="none"
                      stroke="var(--color-border-subtle)"
                      strokeWidth={1}
                      strokeDasharray="4 6"
                      opacity={0.5}
                    />

                    {/* Centre "You" marker */}
                    <circle cx={CX} cy={CY} r={12} fill="var(--color-accent)" opacity={0.85} />
                    <text
                      x={CX}
                      y={CY + 4}
                      textAnchor="middle"
                      fontSize={9}
                      fontWeight="700"
                      fill="#fff"
                    >
                      YOU
                    </text>

                    {/* Spoke lines from centre to each node */}
                    {nodes.map((node, i) => {
                      const pos = positions[i];
                      if (!pos) return null;
                      const color = nodeColor(node.affinity);
                      return (
                        <line
                          key={`spoke-${node.char.id}`}
                          x1={CX}
                          y1={CY}
                          x2={pos.x}
                          y2={pos.y}
                          stroke={color}
                          strokeWidth={1.5}
                          opacity={0.25}
                        />
                      );
                    })}

                    {/* Character nodes */}
                    {nodes.map((node, i) => {
                      const pos = positions[i];
                      if (!pos) return null;
                      const r = nodeRadius(node.affinity);
                      const color = nodeColor(node.affinity);
                      const isHovered = hoveredId === node.char.id;
                      const tier = node.affinity != null ? affinityTier(node.affinity) : null;

                      return (
                        <g
                          key={node.char.id}
                          onClick={() => handleNodeClick(node.char)}
                          onMouseEnter={() => setHoveredId(node.char.id)}
                          onMouseLeave={() => setHoveredId(null)}
                          style={{ cursor: 'pointer' }}
                          role="button"
                          aria-label={`Select ${node.char.name}${tier ? `, ${tier}` : ''}`}
                        >
                          {/* Glow ring on hover */}
                          {isHovered && (
                            <circle
                              cx={pos.x}
                              cy={pos.y}
                              r={r + 6}
                              fill="none"
                              stroke={color}
                              strokeWidth={2}
                              opacity={0.4}
                            />
                          )}

                          {/* Main node circle */}
                          <circle
                            cx={pos.x}
                            cy={pos.y}
                            r={r}
                            fill={color}
                            opacity={isHovered ? 1 : 0.82}
                            style={{ transition: 'opacity 0.15s, r 0.2s' }}
                          />

                          {/* Avatar initial letter */}
                          <text
                            x={pos.x}
                            y={pos.y + 5}
                            textAnchor="middle"
                            fontSize={r * 0.55}
                            fontWeight="700"
                            fill="rgba(0,0,0,0.6)"
                            style={{ userSelect: 'none', pointerEvents: 'none' }}
                          >
                            {node.char.name[0]?.toUpperCase() ?? '?'}
                          </text>

                          {/* Name label below node */}
                          <text
                            x={pos.x}
                            y={pos.y + r + 16}
                            textAnchor="middle"
                            fontSize={11}
                            fontWeight={isHovered ? '700' : '500'}
                            fill={isHovered ? 'var(--color-text-primary)' : 'var(--color-text-secondary)'}
                            style={{ userSelect: 'none', pointerEvents: 'none' }}
                          >
                            {truncateName(node.char.name)}
                          </text>

                          {/* Affinity % label below name */}
                          {node.affinity != null && (
                            <text
                              x={pos.x}
                              y={pos.y + r + 29}
                              textAnchor="middle"
                              fontSize={9}
                              fill="var(--color-text-tertiary)"
                              style={{ userSelect: 'none', pointerEvents: 'none' }}
                            >
                              {Math.round(node.affinity * 100)}%
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </svg>

                  {/* Legend */}
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '8px 16px',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      backgroundColor: 'var(--color-surface)',
                      border: '1px solid var(--color-border-subtle)',
                    }}
                  >
                    {(
                      [
                        ['#e879a0', 'Devoted ≥80%'],
                        ['#34d399', 'Close ≥60%'],
                        ['#86efac', 'Friendly ≥40%'],
                        ['#fbbf24', 'Neutral ≥20%'],
                        ['#94a3b8', 'Stranger'],
                      ] as [string, string][]
                    ).map(([color, label]) => (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            backgroundColor: color,
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            fontSize: '0.68rem',
                            color: 'var(--color-text-tertiary)',
                          }}
                        >
                          {label}
                        </span>
                      </div>
                    ))}
                  </div>

                  <p
                    style={{
                      fontSize: '0.7rem',
                      color: 'var(--color-text-tertiary)',
                      textAlign: 'center',
                      opacity: 0.6,
                      margin: 0,
                    }}
                  >
                    Click a node to open that character's chat.
                  </p>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
