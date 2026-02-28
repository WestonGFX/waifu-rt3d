import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Trash2, ChevronLeft, ChevronRight, Database, Network, List } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { useChatStore } from '../stores/chatStore';

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

interface ContextBudget {
  total_tokens?: number;
  used_tokens?: number;
  system_tokens?: number;
  history_tokens?: number;
  memory_tokens?: number;
}

interface Memory {
  id: string;
  text: string;
  role?: string;
  timestamp?: number;
  score?: number;
  char_id?: number;
}

const PAGE_SIZE = 12;

/* ═══════════════════════════════════════════════════════════════════════
   Memory Graph types
   ═══════════════════════════════════════════════════════════════════════ */

interface GraphNode {
  id: string;
  label: string;
  role: 'user' | 'assistant' | 'memory';
  x: number;
  y: number;
  score?: number;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: 'sequence' | 'retrieval';
}

interface GraphData {
  mode: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: { sessionMessages: number; memoryHits: number; ragAvailable: boolean };
}

/** Color per node role — accent for user, pink for assistant, green for memory hits. */
const GRAPH_ROLE_COLOR: Record<GraphNode['role'], string> = {
  user:      'var(--color-accent)',
  assistant: '#f472b6',
  memory:    'var(--color-success, #4ade80)',
};

/* ═══════════════════════════════════════════════════════════════════════
   MemoryGraphView — pure SVG graph rendered from server-supplied coordinates
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Fetches `/api/v2/memory/graph` and renders an SVG diagram showing the
 * current session's message flow plus any RAG memory-hit nodes.
 *
 * Node layout is computed server-side; the component only needs to position
 * SVG primitives at the supplied x/y coordinates. No layout library required.
 *
 * @param sessionId - Active session ID.  Null = render placeholder.
 * @param charId    - Active character ID used for RAG memory query.
 */
function MemoryGraphView({ sessionId, charId }: { sessionId: number | null; charId: number }) {
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [tooltip, setTooltip] = useState<{ id: string; label: string } | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    setLoading(true);
    fetch(`/api/v2/memory/graph?session_id=${sessionId}&char_id=${charId}&limit=40`)
      .then(r => r.ok ? r.json() : null)
      .then((d: GraphData | null) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [sessionId, charId]);

  if (!sessionId) {
    return (
      <p className="text-xs text-center py-6" style={{ color: 'var(--color-text-tertiary)' }}>
        Open a conversation to see the graph.
      </p>
    );
  }

  if (loading) {
    return (
      <p className="text-xs text-center py-6" style={{ color: 'var(--color-text-tertiary)' }}>
        Building graph…
      </p>
    );
  }

  if (!data || data.nodes.length === 0) {
    return (
      <p className="text-xs text-center py-6" style={{ color: 'var(--color-text-tertiary)' }}>
        No messages yet — start a conversation.
      </p>
    );
  }

  const nodeMap = new Map<string, GraphNode>(data.nodes.map(n => [n.id, n]));
  const maxX = Math.max(...data.nodes.map(n => n.x)) + 60;
  const maxY = Math.max(...data.nodes.map(n => n.y)) + 60;

  return (
    <div>
      {/* SVG canvas */}
      <div className="overflow-x-auto rounded-xl" style={{ backgroundColor: 'var(--color-background)', border: '1px solid var(--color-border-subtle)' }}>
        <svg
          viewBox={`0 0 ${maxX} ${maxY}`}
          width="100%"
          style={{ minHeight: 200, display: 'block' }}
          onClick={() => setTooltip(null)}
        >
          {/* Edges */}
          {data.edges.map(edge => {
            const src = nodeMap.get(edge.source);
            const tgt = nodeMap.get(edge.target);
            if (!src || !tgt) return null;
            return (
              <line
                key={edge.id}
                x1={src.x} y1={src.y}
                x2={tgt.x} y2={tgt.y}
                stroke={edge.kind === 'retrieval' ? GRAPH_ROLE_COLOR.memory : 'var(--color-border)'}
                strokeWidth={1.5}
                strokeDasharray={edge.kind === 'retrieval' ? '5 3' : undefined}
                opacity={0.6}
              />
            );
          })}

          {/* Nodes */}
          {data.nodes.map(node => {
            const color = GRAPH_ROLE_COLOR[node.role];
            const r = node.role === 'memory' ? 10 : 12;
            const isActive = tooltip?.id === node.id;
            return (
              <g
                key={node.id}
                onClick={e => { e.stopPropagation(); setTooltip(isActive ? null : { id: node.id, label: node.label }); }}
                style={{ cursor: 'pointer' }}
              >
                <circle
                  cx={node.x} cy={node.y} r={r}
                  fill={color} fillOpacity={isActive ? 0.28 : 0.14}
                  stroke={color} strokeWidth={isActive ? 2 : 1.5}
                />
                <text x={node.x} y={node.y + 3.5} textAnchor="middle" fontSize={7} fill={color} fontWeight={600}>
                  {node.role === 'user' ? 'U' : node.role === 'assistant' ? 'A' : `${node.score != null ? `${(node.score * 100).toFixed(0)}%` : 'M'}`}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Tooltip — shows clicked node label */}
      {tooltip && (
        <div
          className="mt-2 px-3 py-2 rounded-lg text-[11px] leading-relaxed"
          style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-secondary)', wordBreak: 'break-word' }}
        >
          {tooltip.label || '(empty)'}
        </div>
      )}

      {/* Legend + stats */}
      <div className="flex flex-wrap items-center gap-3 mt-2.5 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
        {(['user', 'assistant', 'memory'] as const).map(role => (
          <span key={role} className="flex items-center gap-1">
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: GRAPH_ROLE_COLOR[role] }} />
            {role}
          </span>
        ))}
        <span className="ml-auto">
          {data.stats.sessionMessages} msgs
          {data.stats.memoryHits > 0 && ` · ${data.stats.memoryHits} memories`}
          {data.mode === 'rag' && ' · RAG'}
        </span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Helpers — raw fetch wrappers for memory endpoints
   ═══════════════════════════════════════════════════════════════════════ */

async function fetchMemories(page: number, charId: number): Promise<{ memories: Memory[]; total: number }> {
  const params = new URLSearchParams({ page: String(page), size: String(PAGE_SIZE) });
  if (charId > 0) params.set('char_id', String(charId));
  const res = await fetch(`/api/v2/memory/list?${params}`);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function searchMemories(query: string, charId: number): Promise<{ results: Memory[] }> {
  const charParam = charId > 0 ? `&char_id=${charId}` : '&char_id=0';
  const res = await fetch(`/api/v2/memory/search?query=${encodeURIComponent(query)}&n_results=20${charParam}`);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function deleteMemory(id: string): Promise<void> {
  const res = await fetch(`/api/v2/memory/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`${res.status}`);
}

/* ═══════════════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Right slide-out panel with full Memory Manager.
 *
 * Sections:
 * 1. **Token Budget** — context window usage for the active character
 * 2. **Memory Browser** — paginated list of ChromaDB memories with search,
 *    character filter, relevance scores, and per-row delete
 *
 * Matches the feature set of Neon's MemoryManager modal.
 */
export function MemoryPanel() {
  const { activeOverlay, closeOverlay, activeCharacter, characters } = useAppStore();
  const { sessionId } = useChatStore();
  const open = activeOverlay === 'memory';

  /** 'list' = paginated memory browser, 'graph' = SVG session + RAG graph */
  const [viewMode, setViewMode] = useState<'list' | 'graph'>('list');

  // Token budget
  const [budget, setBudget] = useState<ContextBudget | null>(null);

  // Memory browser state
  const [memories, setMemories] = useState<Memory[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState('');
  const [filterCharId, setFilterCharId] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Load context budget when panel opens
  useEffect(() => {
    if (!open || !activeCharacter?.id) return;
    fetch(`/api/context-budget/${activeCharacter.id}`)
      .then(r => r.ok ? r.json() : null)
      .then(setBudget)
      .catch(() => setBudget(null));
  }, [open, activeCharacter?.id]);

  // Load memories page
  const loadPage = useCallback(async (p: number, charId: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMemories(p, charId);
      setMemories(data.memories || []);
      setTotal(data.total || 0);
      setPage(p);
      setIsSearchMode(false);
    } catch (e) {
      setError((e as Error).message);
      setMemories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Semantic search
  const doSearch = useCallback(async (q: string, charId: number) => {
    if (!q.trim()) {
      loadPage(0, charId);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await searchMemories(q, charId);
      setMemories(data.results || []);
      setTotal(data.results?.length || 0);
      setIsSearchMode(true);
    } catch (e) {
      setError((e as Error).message);
      setMemories([]);
    } finally {
      setLoading(false);
    }
  }, [loadPage]);

  // Handle delete
  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      await deleteMemory(id);
      // Refresh current view
      if (isSearchMode && query) {
        doSearch(query, filterCharId);
      } else {
        loadPage(page, filterCharId);
      }
    } catch {
      // Silently fail — could show toast later
    } finally {
      setDeletingId(null);
    }
  }, [isSearchMode, query, filterCharId, page, loadPage, doSearch]);

  // Load first page when panel opens
  useEffect(() => {
    if (open) {
      setQuery('');
      setFilterCharId(0);
      loadPage(0, 0);
    }
  }, [open, loadPage]);

  // Reload when character filter changes
  const handleFilterChange = (charId: number) => {
    setFilterCharId(charId);
    if (isSearchMode && query) {
      doSearch(query, charId);
    } else {
      loadPage(0, charId);
    }
  };

  const handleSearchSubmit = () => doSearch(query, filterCharId);
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearchSubmit();
  };

  /** Format a Unix timestamp into a readable short date. */
  const formatTime = (ts?: number) => {
    if (!ts) return '';
    return new Date(ts * 1000).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  /** Role badge color. */
  const roleColor = (role?: string) => {
    if (role === 'user') return 'var(--color-accent)';
    if (role === 'knowledge') return 'var(--color-success)';
    return 'var(--color-text-tertiary)';
  };

  const cardStyle = {
    backgroundColor: 'var(--color-background)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: '10px',
  };

  const fieldStyle = {
    backgroundColor: 'var(--color-background)',
    border: '1px solid var(--color-border-subtle)',
    color: 'var(--color-text-primary)',
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            exit={{ opacity: 0 }}
            onClick={closeOverlay}
            className="fixed inset-0 bg-black z-40"
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="fixed right-0 top-0 bottom-0 z-50 flex flex-col overflow-hidden"
            style={{
              width: 'min(460px, 85vw)',
              backgroundColor: 'var(--color-surface)',
              borderLeft: '1px solid var(--color-border-subtle)',
              boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
            }}
          >
            {/* ── Header ─────────────────────────────────────── */}
            <div
              className="flex items-center justify-between px-4 h-12 flex-shrink-0"
              style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
            >
              <div className="flex items-center gap-2">
                <Database size={14} style={{ color: 'var(--color-accent)' }} />
                <span className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  Memory Bank
                </span>
              </div>
              <button
                onClick={closeOverlay}
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                <X size={16} />
              </button>
            </div>

            {/* ── Content ────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">

              {/* Token Budget Card */}
              {activeCharacter && (
                <div className="p-3" style={cardStyle}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>
                      Token Budget
                    </p>
                    <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                      {activeCharacter.name}
                    </span>
                  </div>
                  {budget ? (
                    <div className="space-y-1.5">
                      {([
                        ['Total', budget.total_tokens],
                        ['Used', budget.used_tokens],
                        ['System', budget.system_tokens],
                        ['History', budget.history_tokens],
                        ['Memory', budget.memory_tokens],
                      ] as [string, number | undefined][]).filter(([, v]) => v != null).map(([label, value]) => (
                        <div key={label} className="flex justify-between items-center text-xs">
                          <span style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
                          <span className="font-medium tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
                            {value!.toLocaleString()}
                          </span>
                        </div>
                      ))}
                      {/* Usage bar */}
                      {budget.total_tokens && budget.used_tokens != null && (
                        <div className="mt-2">
                          <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-border)' }}>
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${Math.min(100, (budget.used_tokens / budget.total_tokens) * 100)}%`,
                                background: 'var(--color-accent-gradient)',
                              }}
                            />
                          </div>
                          <p className="text-[10px] mt-1 text-right" style={{ color: 'var(--color-text-tertiary)' }}>
                            {((budget.used_tokens / budget.total_tokens) * 100).toFixed(0)}% used
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Loading...</p>
                  )}
                </div>
              )}

              {/* ── Memory Browser ────────────────────────────── */}
              <div>
                {/* Section header with list/graph toggle */}
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>
                    Memory Store
                  </p>
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => setViewMode('list')}
                      aria-pressed={viewMode === 'list'}
                      title="List view"
                      className="p-1 rounded transition-colors"
                      style={{ color: viewMode === 'list' ? 'var(--color-accent)' : 'var(--color-text-tertiary)', backgroundColor: viewMode === 'list' ? 'var(--color-accent-soft)' : 'transparent' }}
                    >
                      <List size={12} />
                    </button>
                    <button
                      onClick={() => setViewMode('graph')}
                      aria-pressed={viewMode === 'graph'}
                      title="Graph view"
                      className="p-1 rounded transition-colors"
                      style={{ color: viewMode === 'graph' ? 'var(--color-accent)' : 'var(--color-text-tertiary)', backgroundColor: viewMode === 'graph' ? 'var(--color-accent-soft)' : 'transparent' }}
                    >
                      <Network size={12} />
                    </button>
                  </div>
                </div>

                {/* Graph view */}
                {viewMode === 'graph' && (
                  <MemoryGraphView
                    sessionId={typeof sessionId === 'number' ? sessionId : null}
                    charId={activeCharacter?.id ?? 0}
                  />
                )}

                {/* List view — search + filter + paginated list */}
                {viewMode === 'list' && (<><div className="flex gap-1.5 mb-3">
                  <div className="relative flex-1">
                    <Search
                      size={12}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    />
                    <input
                      type="text"
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      onKeyDown={handleSearchKeyDown}
                      placeholder="Semantic search..."
                      className="w-full text-[11px] pl-7 pr-2 py-1.5 rounded-lg outline-none"
                      style={fieldStyle}
                    />
                  </div>
                  <select
                    value={filterCharId}
                    onChange={e => handleFilterChange(parseInt(e.target.value))}
                    className="text-[11px] px-2 py-1.5 rounded-lg outline-none"
                    style={fieldStyle}
                  >
                    <option value={0}>All</option>
                    {characters.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleSearchSubmit}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
                    style={{
                      backgroundColor: 'var(--color-accent-soft)',
                      color: 'var(--color-accent)',
                      border: '1px solid var(--color-accent)',
                    }}
                  >
                    Go
                  </button>
                </div>

                {/* Memory List */}
                <div className="space-y-1">
                  {loading && (
                    <p className="text-xs text-center py-6" style={{ color: 'var(--color-text-tertiary)' }}>
                      Loading...
                    </p>
                  )}

                  {error && (
                    <p className="text-xs text-center py-6" style={{ color: 'var(--color-danger)' }}>
                      Failed to load: {error}
                    </p>
                  )}

                  {!loading && !error && memories.length === 0 && (
                    <p className="text-xs text-center py-6" style={{ color: 'var(--color-text-tertiary)' }}>
                      {isSearchMode ? 'No matching memories found.' : 'No memories stored yet.'}
                    </p>
                  )}

                  {!loading && memories.map(mem => (
                    <div
                      key={mem.id}
                      className="group p-2.5 rounded-lg transition-colors duration-100"
                      style={cardStyle}
                    >
                      {/* Meta row */}
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="text-[9px] uppercase font-bold tracking-wider"
                          style={{ color: roleColor(mem.role) }}
                        >
                          {mem.role || 'unknown'}
                        </span>
                        {mem.score != null && (
                          <span className="text-[9px] font-medium" style={{ color: 'var(--color-success)' }}>
                            {(mem.score * 100).toFixed(0)}%
                          </span>
                        )}
                        <span className="text-[9px] ml-auto" style={{ color: 'var(--color-text-tertiary)' }}>
                          {formatTime(mem.timestamp)}
                        </span>
                        <button
                          onClick={() => handleDelete(mem.id)}
                          disabled={deletingId === mem.id}
                          className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity p-0.5 rounded"
                          style={{ color: 'var(--color-danger)' }}
                          title="Delete memory"
                        >
                          {deletingId === mem.id ? (
                            <span className="text-[9px]">...</span>
                          ) : (
                            <Trash2 size={11} />
                          )}
                        </button>
                      </div>
                      {/* Text preview */}
                      <p
                        className="text-[11px] leading-relaxed"
                        style={{ color: 'var(--color-text-secondary)', wordBreak: 'break-word' }}
                      >
                        {(mem.text || '').slice(0, 200)}
                        {(mem.text?.length || 0) > 200 && '...'}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {!isSearchMode && !loading && (
                  <div className="flex items-center justify-between mt-3 pt-2" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                    <button
                      onClick={() => page > 0 && loadPage(page - 1, filterCharId)}
                      disabled={page === 0}
                      className="p-1 rounded disabled:opacity-30 transition-opacity"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                      Page {page + 1} / {totalPages} ({total} memories)
                    </span>
                    <button
                      onClick={() => page < totalPages - 1 && loadPage(page + 1, filterCharId)}
                      disabled={page >= totalPages - 1}
                      className="p-1 rounded disabled:opacity-30 transition-opacity"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                )}

                {isSearchMode && !loading && (
                  <div className="text-center mt-3 pt-2" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                    <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                      {total} search result{total !== 1 ? 's' : ''}
                    </span>
                    <button
                      onClick={() => { setQuery(''); loadPage(0, filterCharId); }}
                      className="text-[10px] ml-2 underline"
                      style={{ color: 'var(--color-accent)' }}
                    >
                      Clear search
                    </button>
                  </div>
                )}
                </>)}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
