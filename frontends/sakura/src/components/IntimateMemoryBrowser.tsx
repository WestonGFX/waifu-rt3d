/**
 * IntimateMemoryBrowser — Feature F2: Intimate Memory Recall
 *
 * Overlay panel for viewing and deleting a character's intimate memories.
 * These are sensory-anchored memories that the LLM uses for continuity
 * across intimate scenes — recalling past moments, preferences, and
 * emotional details.
 *
 * API surface:
 *   GET    /api/characters/{id}/intimate-memories          — list memories
 *   DELETE /api/characters/{id}/intimate-memories/{mem_id} — delete one
 *
 * @module IntimateMemoryBrowser
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Heart, Trash2, Loader2, Search, Sparkles, Clock,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

/** An intimate memory entry returned by the backend. */
interface IntimateMemory {
  id: number;
  category: string;
  summary: string;
  sensory_anchors: string[] | null;
  emotional_tone: string | null;
  intensity: number;
  recall_count: number;
  created_at: string;
}

interface IntimateMemoryBrowserProps {
  /** Whether the panel is visible. */
  isOpen: boolean;
  /** Callback to close the panel. */
  onClose: () => void;
  /** Character database ID. */
  characterId: number;
  /** Character display name. */
  characterName: string;
}

/* ═══════════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════════ */

/** Category labels and subtle background tints. */
const CATEGORY_STYLES: Record<string, { label: string; bg: string; color: string }> = {
  romantic:    { label: 'Romantic',    bg: 'rgba(239, 68, 68, 0.08)',  color: '#ef4444' },
  physical:   { label: 'Physical',    bg: 'rgba(168, 85, 247, 0.08)', color: '#a855f7' },
  emotional:  { label: 'Emotional',   bg: 'rgba(59, 130, 246, 0.08)', color: '#3b82f6' },
  playful:    { label: 'Playful',     bg: 'rgba(251, 191, 36, 0.08)', color: '#fbbf24' },
  tender:     { label: 'Tender',      bg: 'rgba(34, 197, 94, 0.08)',  color: '#22c55e' },
  passionate: { label: 'Passionate',  bg: 'rgba(244, 63, 94, 0.08)', color: '#f43f5e' },
};

/* ═══════════════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Slide-in panel for browsing and managing a character's intimate memories.
 * Each memory shows its sensory anchors, emotional tone, and intensity level.
 * Users can search, filter by category, and delete individual memories.
 *
 * @param props - See {@link IntimateMemoryBrowserProps}.
 *
 * @example
 * <IntimateMemoryBrowser
 *   isOpen={showMemories}
 *   onClose={() => setShowMemories(false)}
 *   characterId={5}
 *   characterName="Luna"
 * />
 */
export function IntimateMemoryBrowser({
  isOpen,
  onClose,
  characterId,
  characterName,
}: IntimateMemoryBrowserProps) {
  const [memories, setMemories] = useState<IntimateMemory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  /* ── Fetch memories ──────────────────────────────────────────────── */

  const fetchMemories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/characters/${characterId}/intimate-memories`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMemories(data.memories ?? []);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [characterId]);

  useEffect(() => {
    if (isOpen && characterId) fetchMemories();
  }, [isOpen, characterId, fetchMemories]);

  /* ── Delete a memory ─────────────────────────────────────────────── */

  const handleDelete = async (memId: number) => {
    setDeletingId(memId);
    try {
      const res = await fetch(
        `/api/characters/${characterId}/intimate-memories/${memId}`,
        { method: 'DELETE' },
      );
      if (res.ok) {
        setMemories(prev => prev.filter(m => m.id !== memId));
        if (expandedId === memId) setExpandedId(null);
      }
    } catch {
      // Non-fatal
    } finally {
      setDeletingId(null);
    }
  };

  /* ── Filtered & searched memories ────────────────────────────────── */

  const filtered = memories.filter(m => {
    if (categoryFilter && m.category !== categoryFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        m.summary.toLowerCase().includes(q) ||
        (m.emotional_tone ?? '').toLowerCase().includes(q) ||
        (m.sensory_anchors ?? []).some(a => a.toLowerCase().includes(q))
      );
    }
    return true;
  });

  /* ── Unique categories present in data ───────────────────────────── */

  const categories = [...new Set(memories.map(m => m.category))];

  /* ── Helpers ─────────────────────────────────────────────────────── */

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return iso;
    }
  };

  const getCategoryStyle = (cat: string) =>
    CATEGORY_STYLES[cat] ?? { label: cat, bg: 'var(--color-accent-soft)', color: 'var(--color-accent)' };

  const intensityDots = (level: number) =>
    Array.from({ length: 5 }, (_, i) => (
      <span
        key={i}
        style={{
          width: 5, height: 5, borderRadius: '50%',
          backgroundColor: i < level ? 'var(--color-accent)' : 'var(--color-border)',
          display: 'inline-block',
        }}
      />
    ));

  /* ── Render ──────────────────────────────────────────────────────── */

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-[200]"
            style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            className="fixed inset-y-4 right-4 z-[201] flex flex-col overflow-hidden"
            style={{
              width: 460,
              backgroundColor: 'var(--color-surface)',
              borderRadius: 'var(--radius-card)',
              boxShadow: 'var(--shadow-elevated)',
              border: '1px solid var(--color-border-subtle)',
            }}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
          >
            {/* ── Header ──────────────────────────────────────────── */}
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
            >
              <div className="flex items-center gap-2">
                <Heart size={16} style={{ color: 'var(--color-accent)' }} />
                <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  {characterName}&apos;s Intimate Memories
                </h2>
                <span
                  className="text-xs px-1.5 py-0.5 rounded-full"
                  style={{
                    backgroundColor: 'var(--color-accent-soft)',
                    color: 'var(--color-accent)',
                    fontSize: '0.65rem',
                  }}
                >
                  {filtered.length}
                </span>
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-md hover:opacity-80 transition-opacity"
                style={{ color: 'var(--color-text-secondary)' }}
                aria-label="Close intimate memories"
              >
                <X size={16} />
              </button>
            </div>

            {/* ── Search + Category Filter ─────────────────────────── */}
            <div className="px-4 py-2 space-y-2" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
              {/* Search */}
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                style={{
                  backgroundColor: 'var(--color-background)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <Search size={13} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                <input
                  type="text"
                  placeholder="Search memories..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="flex-1 text-xs bg-transparent outline-none"
                  style={{ color: 'var(--color-text-primary)' }}
                />
              </div>

              {/* Category chips */}
              {categories.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setCategoryFilter(null)}
                    className="text-xs px-2 py-0.5 rounded-full transition-all"
                    style={{
                      backgroundColor: !categoryFilter ? 'var(--color-accent-soft)' : 'transparent',
                      color: !categoryFilter ? 'var(--color-accent)' : 'var(--color-text-muted)',
                      border: `1px solid ${!categoryFilter ? 'var(--color-accent)' : 'var(--color-border)'}`,
                    }}
                  >
                    All
                  </button>
                  {categories.map(cat => {
                    const s = getCategoryStyle(cat);
                    const active = categoryFilter === cat;
                    return (
                      <button
                        key={cat}
                        onClick={() => setCategoryFilter(active ? null : cat)}
                        className="text-xs px-2 py-0.5 rounded-full transition-all"
                        style={{
                          backgroundColor: active ? s.bg : 'transparent',
                          color: active ? s.color : 'var(--color-text-muted)',
                          border: `1px solid ${active ? s.color : 'var(--color-border)'}`,
                        }}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Memory list ──────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto px-4 py-2">
              {loading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={20} className="animate-spin" style={{ color: 'var(--color-text-muted)' }} />
                </div>
              )}

              {error && (
                <div className="text-xs text-center py-8" style={{ color: 'var(--color-danger)' }}>
                  Failed to load memories
                </div>
              )}

              {!loading && !error && filtered.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <Sparkles size={28} style={{ color: 'var(--color-text-muted)', opacity: 0.4 }} />
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {search || categoryFilter
                      ? 'No memories match your filters'
                      : 'No intimate memories yet'}
                  </p>
                  {!search && !categoryFilter && (
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)', opacity: 0.7 }}>
                      Memories form naturally as your bond deepens
                    </p>
                  )}
                </div>
              )}

              {!loading && filtered.map((mem) => {
                const catStyle = getCategoryStyle(mem.category);
                const expanded = expandedId === mem.id;
                return (
                  <motion.div
                    key={mem.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-2 rounded-lg overflow-hidden"
                    style={{
                      backgroundColor: 'var(--color-surface-raised)',
                      border: '1px solid var(--color-border-subtle)',
                    }}
                  >
                    {/* Card header — clickable to expand */}
                    <div
                      className="p-3 cursor-pointer"
                      onClick={() => setExpandedId(expanded ? null : mem.id)}
                    >
                      {/* Top row: category badge + intensity + date + delete */}
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-xs px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: catStyle.bg, color: catStyle.color, fontSize: '0.6rem' }}
                          >
                            {catStyle.label}
                          </span>
                          <div className="flex items-center gap-0.5">
                            {intensityDots(mem.intensity)}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="flex items-center gap-0.5" style={{ color: 'var(--color-text-muted)' }}>
                            <Clock size={10} />
                            <span style={{ fontSize: '0.6rem' }}>{formatDate(mem.created_at)}</span>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(mem.id); }}
                            className="p-0.5 rounded hover:opacity-80 transition-opacity"
                            style={{ color: 'var(--color-text-muted)' }}
                            aria-label="Delete memory"
                            disabled={deletingId === mem.id}
                          >
                            {deletingId === mem.id
                              ? <Loader2 size={11} className="animate-spin" />
                              : <Trash2 size={11} />}
                          </button>
                        </div>
                      </div>

                      {/* Summary */}
                      <p
                        className="text-xs leading-relaxed"
                        style={{
                          color: 'var(--color-text-primary)',
                          ...(expanded ? {} : {
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical' as const,
                            overflow: 'hidden',
                          }),
                        }}
                      >
                        {mem.summary}
                      </p>
                    </div>

                    {/* Expanded details */}
                    <AnimatePresence>
                      {expanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="px-3 pb-3 space-y-2"
                          style={{ borderTop: '1px solid var(--color-border-subtle)' }}
                        >
                          {/* Emotional tone */}
                          {mem.emotional_tone && (
                            <div className="pt-2">
                              <span className="text-xs" style={{ color: 'var(--color-text-muted)', fontSize: '0.6rem' }}>
                                Emotional Tone
                              </span>
                              <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                                {mem.emotional_tone}
                              </p>
                            </div>
                          )}

                          {/* Sensory anchors */}
                          {mem.sensory_anchors && mem.sensory_anchors.length > 0 && (
                            <div>
                              <span className="text-xs" style={{ color: 'var(--color-text-muted)', fontSize: '0.6rem' }}>
                                Sensory Anchors
                              </span>
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                {mem.sensory_anchors.map((anchor, i) => (
                                  <span
                                    key={i}
                                    className="text-xs px-1.5 py-0.5 rounded"
                                    style={{
                                      backgroundColor: 'var(--color-accent-soft)',
                                      color: 'var(--color-accent)',
                                      fontSize: '0.6rem',
                                    }}
                                  >
                                    {anchor}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Recall count */}
                          {mem.recall_count > 0 && (
                            <p className="text-xs" style={{ color: 'var(--color-text-muted)', fontSize: '0.6rem' }}>
                              Recalled {mem.recall_count} time{mem.recall_count > 1 ? 's' : ''} in conversation
                            </p>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
