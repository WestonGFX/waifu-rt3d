import { useEffect, useState, useCallback, useRef } from 'react';

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Raw message shape returned by
 * GET /api/sessions/{sessionId}/messages?include_branches=true.
 *
 * The backend may use either `content` or `text` for the message body;
 * we normalise to `content` internally.
 */
interface RawMessage {
  id: number;
  role: 'user' | 'assistant' | 'system';
  /** Preferred field name for message body. */
  content?: string;
  /** Fallback field name used by some older response shapes. */
  text?: string;
  parent_id: number | null;
  /** 1 = on the active conversation path, 0 = an inactive branch. */
  is_active: number;
  /** ISO-8601 timestamp string. */
  ts?: string;
  created_at?: string;
}

/**
 * Internal tree node built from RawMessage data.
 * Each node carries pre-calculated layout coordinates.
 */
interface TreeNode {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  parentId: number | null;
  isActive: boolean;
  children: TreeNode[];
  /** Horizontal centre position in SVG units (pixels). */
  x: number;
  /** Vertical centre position in SVG units (pixels). */
  y: number;
}

/** Sizing constants for the SVG layout. */
const NODE_RADIUS = 8;
/** Vertical gap between tree levels (parent bottom to child top). */
const LEVEL_GAP = 40;
/** Minimum horizontal gap between sibling nodes (centre-to-centre). */
const SIBLING_GAP = 28;
/** Horizontal padding inside the SVG viewport. */
const H_PADDING = 16;
/** Vertical padding inside the SVG viewport. */
const V_PADDING = 12;

/* ═══════════════════════════════════════════════════════════════════════
   Tree-building helpers
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Build a children map from parent_id → child RawMessage[].
 * Messages with parent_id = null are roots.
 *
 * @param messages - Raw messages from the API.
 * @returns Map of parentId (or -1 for roots) → children array.
 */
function buildChildrenMap(messages: RawMessage[]): Map<number | null, RawMessage[]> {
  const map = new Map<number | null, RawMessage[]>();
  for (const m of messages) {
    const key = m.parent_id;
    const existing = map.get(key) ?? [];
    existing.push(m);
    map.set(key, existing);
  }
  return map;
}

/**
 * Recursively construct a TreeNode tree from raw message data.
 * Positions are assigned in a second pass via `assignPositions`.
 *
 * @param raw - The raw message to convert to a node.
 * @param childrenMap - Pre-built parent_id → children map.
 * @returns A TreeNode with all descendants populated (positions = 0 until layout pass).
 */
function buildNode(
  raw: RawMessage,
  childrenMap: Map<number | null, RawMessage[]>
): TreeNode {
  const children = (childrenMap.get(raw.id) ?? []).map(child =>
    buildNode(child, childrenMap)
  );
  return {
    id: raw.id,
    role: raw.role,
    content: raw.content ?? raw.text ?? '',
    parentId: raw.parent_id,
    isActive: raw.is_active === 1,
    children,
    x: 0,
    y: 0,
  };
}

/**
 * Calculate the subtree width (in SVG units) needed for a node and all its
 * descendants, used by the Reingold-Tilford-inspired layout algorithm.
 *
 * @param node - Root of the subtree to measure.
 * @returns Minimum width in SVG units.
 */
function subtreeWidth(node: TreeNode): number {
  if (node.children.length === 0) return SIBLING_GAP;
  const childTotal = node.children.reduce((sum, c) => sum + subtreeWidth(c), 0);
  // Add inter-sibling gaps
  return childTotal + Math.max(0, node.children.length - 1) * 4;
}

/**
 * Recursively assign (x, y) positions to every node in the tree using a
 * simple top-down width-proportional layout.
 *
 * The algorithm distributes horizontal space among siblings proportionally
 * to each sibling's subtree width, ensuring branches never overlap.
 *
 * @param node - Current node to position (mutated in place).
 * @param depth - Tree depth (0 = root).
 * @param xLeft - Left boundary of the horizontal slice allocated to this subtree.
 * @param xRight - Right boundary of the horizontal slice.
 */
function assignPositions(
  node: TreeNode,
  depth: number,
  xLeft: number,
  xRight: number
): void {
  node.x = (xLeft + xRight) / 2;
  node.y = V_PADDING + depth * (NODE_RADIUS * 2 + LEVEL_GAP);

  if (node.children.length === 0) return;

  // Compute total subtree widths for proportional slicing
  const widths = node.children.map(subtreeWidth);
  const totalWidth = widths.reduce((s, w) => s + w, 0);
  const availableWidth = xRight - xLeft;

  let cursor = xLeft;
  for (let i = 0; i < node.children.length; i++) {
    const slice = (widths[i] / totalWidth) * availableWidth;
    assignPositions(node.children[i], depth + 1, cursor, cursor + slice);
    cursor += slice;
  }
}

/**
 * Flatten a tree into a depth-first array of all nodes.
 * Used to build the list of SVG elements to render.
 *
 * @param node - Root of the subtree.
 * @returns All nodes in depth-first order.
 */
function flattenTree(node: TreeNode): TreeNode[] {
  const result: TreeNode[] = [node];
  for (const child of node.children) {
    result.push(...flattenTree(child));
  }
  return result;
}

/**
 * Collect all parent→child edge pairs from a flattened node list.
 * Each edge is represented as [parentNode, childNode].
 *
 * @param nodes - Flat list of all tree nodes.
 * @param idToNode - Map from node id to TreeNode for O(1) lookups.
 * @returns Array of [parent, child] pairs.
 */
function collectEdges(
  nodes: TreeNode[],
  idToNode: Map<number, TreeNode>
): Array<[TreeNode, TreeNode]> {
  const edges: Array<[TreeNode, TreeNode]> = [];
  for (const node of nodes) {
    if (node.parentId !== null) {
      const parent = idToNode.get(node.parentId);
      if (parent) edges.push([parent, node]);
    }
  }
  return edges;
}

/* ═══════════════════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════════════════ */

/** Position and content for the floating tooltip. */
interface TooltipState {
  x: number;
  y: number;
  text: string;
  role: string;
}

/**
 * Floating tooltip div positioned absolutely within the SVG container.
 * Shows message role and first 60 characters of content.
 *
 * @param tooltip - Tooltip data; null hides the tooltip.
 */
function NodeTooltip({ tooltip }: { tooltip: TooltipState | null }) {
  if (!tooltip) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: tooltip.x + 12,
        top: tooltip.y - 8,
        pointerEvents: 'none',
        zIndex: 10,
        maxWidth: 200,
        padding: '5px 8px',
        borderRadius: 6,
        fontSize: '0.68rem',
        lineHeight: 1.4,
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        color: 'var(--color-text-primary)',
      }}
    >
      <span
        style={{
          display: 'block',
          fontWeight: 700,
          textTransform: 'capitalize',
          marginBottom: 2,
          color: tooltip.role === 'user'
            ? 'var(--color-accent)'
            : 'var(--color-text-secondary)',
          fontSize: '0.6rem',
          letterSpacing: '0.07em',
        }}
      >
        {tooltip.role}
      </span>
      {tooltip.text}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Main component
   ═══════════════════════════════════════════════════════════════════════ */

export interface BranchingVisualizerProps {
  /** The session whose message tree to visualize. Null renders nothing. */
  sessionId: number | null;
  /**
   * Called when the user clicks a node on an inactive branch.
   * The parent component is responsible for the actual branch-switch API call.
   *
   * @param messageId - The id of the message to activate.
   */
  onSwitchBranch?: (messageId: number) => void;
}

/**
 * BranchingVisualizer — Feature #14
 *
 * Renders a compact SVG tree diagram visualising the branch structure of a
 * conversation session.  Each circle represents a message; the active path
 * uses solid filled nodes and solid lines, while inactive branches use
 * outlined nodes and dashed lines.
 *
 * Data source: GET /api/sessions/{sessionId}/messages?include_branches=true
 *
 * The component self-fetches on sessionId change and returns null when there
 * are no inactive branches (i.e. the conversation is purely linear).
 *
 * @param sessionId - Active session to inspect.  Null → renders nothing.
 * @param onSwitchBranch - Callback invoked with the clicked message id when
 *   the user selects a node from an inactive branch.
 *
 * @example
 *   <BranchingVisualizer
 *     sessionId={42}
 *     onSwitchBranch={(msgId) => switchToBranch(sessionId, msgId)}
 *   />
 */
export function BranchingVisualizer({ sessionId, onSwitchBranch }: BranchingVisualizerProps) {
  const [roots, setRoots] = useState<TreeNode[]>([]);
  const [hasBranches, setHasBranches] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  /** Track which inactive node the user is hovering, to show the switch button. */
  const [hoveredInactiveId, setHoveredInactiveId] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  /* ── Fetch and build tree on sessionId change ── */
  useEffect(() => {
    if (sessionId == null) {
      setRoots([]);
      setHasBranches(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/sessions/${sessionId}/messages?include_branches=true`)
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json() as Promise<{ messages: RawMessage[] }>;
      })
      .then(({ messages }) => {
        if (cancelled) return;

        // Check if there are any inactive messages — if not, no branches exist
        const anyInactive = messages.some(m => m.is_active === 0);
        setHasBranches(anyInactive);

        if (!anyInactive) {
          setRoots([]);
          setLoading(false);
          return;
        }

        const childrenMap = buildChildrenMap(messages);
        // Root messages: those with parent_id = null
        const rawRoots = childrenMap.get(null) ?? [];
        const builtRoots = rawRoots.map(raw => buildNode(raw, childrenMap));

        // Calculate total tree width for layout
        const totalW = builtRoots.reduce((s, r) => s + subtreeWidth(r), 0);
        const svgInnerWidth = Math.max(totalW, 60);
        const sliceWidth = (svgInnerWidth + H_PADDING * 2) / builtRoots.length;

        // Assign positions to each root tree independently
        let xCursor = H_PADDING;
        for (const root of builtRoots) {
          const w = (subtreeWidth(root) / totalW) * (svgInnerWidth);
          assignPositions(root, 0, xCursor, xCursor + w);
          xCursor += w;
        }
        // Suppress unused variable warning for sliceWidth
        void sliceWidth;

        setRoots(builtRoots);
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        setError(`Failed to load branch data: ${err.message}`);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [sessionId]);

  /* ── Flatten all nodes and edges across all roots ── */
  const { allNodes, allEdges, svgWidth, svgHeight } = (() => {
    if (roots.length === 0) return { allNodes: [], allEdges: [], svgWidth: 0, svgHeight: 0 };

    const nodes: TreeNode[] = [];
    for (const root of roots) {
      nodes.push(...flattenTree(root));
    }

    const idToNode = new Map<number, TreeNode>(nodes.map(n => [n.id, n]));
    const edges = collectEdges(nodes, idToNode);

    const maxX = Math.max(...nodes.map(n => n.x)) + NODE_RADIUS + H_PADDING;
    const maxY = Math.max(...nodes.map(n => n.y)) + NODE_RADIUS + V_PADDING;

    return {
      allNodes: nodes,
      allEdges: edges,
      svgWidth: Math.max(maxX, 60),
      svgHeight: Math.max(maxY, 40),
    };
  })();

  /* ── Node interaction handlers ── */
  const handleNodeMouseEnter = useCallback(
    (node: TreeNode, svgX: number, svgY: number) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      // Convert SVG coordinates to container-relative pixels
      const scaleX = rect.width / svgWidth;
      const scaleY = 1; // SVG height is fixed, container scrolls
      setTooltip({
        x: svgX * scaleX,
        y: svgY * scaleY,
        text: node.content.slice(0, 60) + (node.content.length > 60 ? '…' : ''),
        role: node.role,
      });
      if (!node.isActive) setHoveredInactiveId(node.id);
    },
    [svgWidth]
  );

  const handleNodeMouseLeave = useCallback(() => {
    setTooltip(null);
    setHoveredInactiveId(null);
  }, []);

  const handleNodeClick = useCallback(
    (node: TreeNode) => {
      if (!node.isActive && onSwitchBranch) {
        onSwitchBranch(node.id);
      }
    },
    [onSwitchBranch]
  );

  /* ── Render guards ── */
  if (sessionId == null) return null;

  if (loading) {
    return (
      <div style={{ padding: '8px 0', textAlign: 'center' }}>
        <p style={{ fontSize: '0.68rem', color: 'var(--color-text-tertiary)', margin: 0 }}>
          Loading branch tree…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '8px 0' }}>
        <p style={{ fontSize: '0.68rem', color: 'var(--color-danger, #f55)', margin: 0 }}>
          {error}
        </p>
      </div>
    );
  }

  if (!hasBranches) {
    return (
      <div style={{ padding: '8px 0' }}>
        <p style={{ fontSize: '0.68rem', color: 'var(--color-text-tertiary)', margin: 0, fontStyle: 'italic' }}>
          No alternate branches in this session.
        </p>
      </div>
    );
  }

  /* ── Main render ── */
  return (
    <div
      style={{
        position: 'relative',
        maxWidth: 280,
        overflowY: svgHeight > 200 ? 'scroll' : 'visible',
        overflowX: 'hidden',
        maxHeight: 200,
        borderRadius: 8,
        backgroundColor: 'var(--color-background)',
        border: '1px solid var(--color-border-subtle)',
        padding: '4px',
      }}
      ref={containerRef}
    >
      {/* Legend */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          padding: '4px 6px 6px',
          flexWrap: 'wrap',
        }}
      >
        <LegendItem label="Active path" variant="active-user" />
        <LegendItem label="Active assistant" variant="active-assistant" />
        <LegendItem label="Inactive branch" variant="inactive" />
      </div>

      {/* SVG tree */}
      <div style={{ position: 'relative' }}>
        <svg
          width="100%"
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ display: 'block', overflow: 'visible' }}
          aria-label="Conversation branch tree"
          role="img"
        >
          {/* ── Edges ── */}
          {allEdges.map(([parent, child]) => {
            // Edge is "active" only if both endpoints are on the active path
            const edgeIsActive = parent.isActive && child.isActive;
            return (
              <line
                key={`edge-${parent.id}-${child.id}`}
                x1={parent.x}
                y1={parent.y + NODE_RADIUS}
                x2={child.x}
                y2={child.y - NODE_RADIUS}
                stroke={
                  edgeIsActive
                    ? 'var(--color-accent)'
                    : 'var(--color-text-tertiary, #6b7280)'
                }
                strokeWidth={edgeIsActive ? 1.5 : 1}
                strokeDasharray={edgeIsActive ? undefined : '3 3'}
                opacity={edgeIsActive ? 0.85 : 0.45}
              />
            );
          })}

          {/* ── Nodes ── */}
          {allNodes.map(node => {
            const isUser = node.role === 'user';
            const isInactiveHovered = hoveredInactiveId === node.id;

            // Fill colour: user accent, assistant secondary, inactive = transparent
            const fillColor = node.isActive
              ? isUser
                ? 'var(--color-accent)'
                : 'var(--color-text-secondary, #94a3b8)'
              : 'transparent';

            // Stroke colour: accent for active, tertiary for inactive
            const strokeColor = node.isActive
              ? isUser
                ? 'var(--color-accent)'
                : 'var(--color-text-secondary, #94a3b8)'
              : 'var(--color-text-tertiary, #6b7280)';

            const strokeDash = node.isActive ? undefined : '3 3';
            const cursor = !node.isActive && onSwitchBranch ? 'pointer' : 'default';

            return (
              <g
                key={`node-${node.id}`}
                style={{ cursor }}
                onMouseEnter={() => handleNodeMouseEnter(node, node.x, node.y)}
                onMouseLeave={handleNodeMouseLeave}
                onClick={() => handleNodeClick(node)}
                role={!node.isActive && onSwitchBranch ? 'button' : undefined}
                aria-label={
                  !node.isActive
                    ? `Switch to branch: ${node.content.slice(0, 40)}`
                    : `${node.role} message: ${node.content.slice(0, 40)}`
                }
                tabIndex={!node.isActive && onSwitchBranch ? 0 : undefined}
                onKeyDown={
                  !node.isActive && onSwitchBranch
                    ? (e) => { if (e.key === 'Enter' || e.key === ' ') handleNodeClick(node); }
                    : undefined
                }
              >
                {/* Glow ring for hovered inactive node */}
                {isInactiveHovered && (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={NODE_RADIUS + 3}
                    fill="none"
                    stroke="var(--color-accent)"
                    strokeWidth={1}
                    opacity={0.4}
                  />
                )}

                {/* Main circle */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={NODE_RADIUS}
                  fill={fillColor}
                  stroke={strokeColor}
                  strokeWidth={node.isActive ? 2 : 1.5}
                  strokeDasharray={strokeDash}
                  opacity={node.isActive ? 1 : 0.65}
                />

                {/* "Switch" text indicator inside hovered inactive node */}
                {isInactiveHovered && (
                  <text
                    x={node.x}
                    y={node.y + NODE_RADIUS + 11}
                    textAnchor="middle"
                    fontSize={7}
                    fill="var(--color-accent)"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    switch
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Floating tooltip rendered outside the SVG so text is selectable/readable */}
        <NodeTooltip tooltip={tooltip} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Legend helper
   ═══════════════════════════════════════════════════════════════════════ */

type LegendVariant = 'active-user' | 'active-assistant' | 'inactive';

/**
 * A small colour swatch + label for the tree legend.
 *
 * @param label - Human-readable description.
 * @param variant - Controls the dot colour and style.
 */
function LegendItem({ label, variant }: { label: string; variant: LegendVariant }) {
  const dotStyle: React.CSSProperties = {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  };

  if (variant === 'active-user') {
    dotStyle.backgroundColor = 'var(--color-accent)';
  } else if (variant === 'active-assistant') {
    dotStyle.backgroundColor = 'var(--color-text-secondary, #94a3b8)';
  } else {
    // inactive — outlined circle, no fill
    dotStyle.backgroundColor = 'transparent';
    dotStyle.border = '1.5px dashed var(--color-text-tertiary, #6b7280)';
    dotStyle.width = 7;
    dotStyle.height = 7;
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={dotStyle} />
      <span style={{ fontSize: '0.58rem', color: 'var(--color-text-tertiary)', userSelect: 'none' }}>
        {label}
      </span>
    </div>
  );
}
