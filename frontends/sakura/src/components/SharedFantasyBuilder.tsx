/**
 * SharedFantasyBuilder — Feature F47: Collaborative Fantasy Creation
 *
 * Overlay for viewing and managing shared fantasies built collaboratively
 * between the user and character. Each fantasy has a title, description,
 * and a list of contributions from both parties that evolve over time.
 *
 * API surface:
 *   GET /api/characters/{id}/shared-fantasies
 *       → { ok, fantasies: [{ id, title, description, contributions, status, created_at, played_at }] }
 *
 * @module SharedFantasyBuilder
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Sparkles, Loader2, ChevronDown, ChevronRight, Wand2, Clock,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

/** A single contribution to a shared fantasy. */
interface FantasyContribution {
  author: 'user' | 'character';
  text: string;
  timestamp: string;
}

/** A shared fantasy from the backend. */
interface SharedFantasy {
  id: number;
  title: string;
  description: string;
  contributions: FantasyContribution[];
  status: string;
  created_at: string;
  played_at: string | null;
}

interface SharedFantasyBuilderProps {
  /** Whether the overlay is visible. */
  isOpen: boolean;
  /** Callback to close the overlay. */
  onClose: () => void;
  /** Character database ID. */
  characterId: number;
  /** Character display name. */
  characterName: string;
}

/* ═══════════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════════ */

const STATUS_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  draft:     { label: 'In Progress', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.08)' },
  complete:  { label: 'Complete',    color: '#22c55e', bg: 'rgba(34, 197, 94, 0.08)' },
  played:    { label: 'Played',      color: '#a855f7', bg: 'rgba(168, 85, 247, 0.08)' },
  archived:  { label: 'Archived',    color: '#6b7280', bg: 'rgba(107, 114, 128, 0.08)' },
};

/* ═══════════════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Overlay panel for viewing shared fantasies built collaboratively.
 * Each fantasy shows its contributions as a conversation-like thread
 * between user and character. Fantasies progress through draft →
 * complete → played statuses.
 *
 * @param props - See {@link SharedFantasyBuilderProps}.
 *
 * @example
 * <SharedFantasyBuilder
 *   isOpen={showBuilder}
 *   onClose={() => setShowBuilder(false)}
 *   characterId={5}
 *   characterName="Luna"
 * />
 */
export function SharedFantasyBuilder({
  isOpen,
  onClose,
  characterId,
  characterName,
}: SharedFantasyBuilderProps) {
  const [fantasies, setFantasies] = useState<SharedFantasy[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  /* ── Fetch fantasies ─────────────────────────────────────────────── */

  const fetchFantasies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/characters/${characterId}/shared-fantasies`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setFantasies(data.fantasies ?? []);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [characterId]);

  useEffect(() => {
    if (isOpen && characterId) fetchFantasies();
  }, [isOpen, characterId, fetchFantasies]);

  /* ── Helpers ─────────────────────────────────────────────────────── */

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric',
      });
    } catch {
      return iso;
    }
  };

  const getStatusStyle = (status: string) =>
    STATUS_STYLES[status] ?? STATUS_STYLES.draft;

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
                <Wand2 size={16} style={{ color: 'var(--color-accent)' }} />
                <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  Shared Fantasies
                </h2>
                <span
                  className="text-xs px-1.5 py-0.5 rounded-full"
                  style={{
                    backgroundColor: 'var(--color-accent-soft)',
                    color: 'var(--color-accent)',
                    fontSize: '0.65rem',
                  }}
                >
                  {fantasies.length}
                </span>
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-md hover:opacity-80 transition-opacity"
                style={{ color: 'var(--color-text-secondary)' }}
                aria-label="Close shared fantasies"
              >
                <X size={16} />
              </button>
            </div>

            {/* ── Fantasy list ─────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {loading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={20} className="animate-spin" style={{ color: 'var(--color-text-muted)' }} />
                </div>
              )}

              {error && (
                <div className="text-xs text-center py-8" style={{ color: 'var(--color-danger)' }}>
                  Failed to load fantasies
                </div>
              )}

              {!loading && !error && fantasies.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Sparkles size={28} style={{ color: 'var(--color-text-muted)', opacity: 0.4 }} />
                  <p className="text-xs text-center" style={{ color: 'var(--color-text-muted)' }}>
                    No shared fantasies yet
                  </p>
                  <p className="text-xs text-center" style={{ color: 'var(--color-text-muted)', opacity: 0.7 }}>
                    Build fantasies together through conversation —<br />
                    {characterName} will contribute ideas and details
                  </p>
                </div>
              )}

              {!loading && fantasies.map((fantasy) => {
                const expanded = expandedId === fantasy.id;
                const statusStyle = getStatusStyle(fantasy.status);
                return (
                  <motion.div
                    key={fantasy.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-3 rounded-lg overflow-hidden"
                    style={{
                      backgroundColor: 'var(--color-surface-raised)',
                      border: '1px solid var(--color-border-subtle)',
                    }}
                  >
                    {/* Fantasy header — clickable */}
                    <div
                      className="p-3 cursor-pointer"
                      onClick={() => setExpandedId(expanded ? null : fantasy.id)}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {expanded
                            ? <ChevronDown size={13} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                            : <ChevronRight size={13} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />}
                          <span className="text-xs font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
                            {fantasy.title}
                          </span>
                        </div>
                        <span
                          className="text-xs px-1.5 py-0.5 rounded flex-shrink-0"
                          style={{
                            backgroundColor: statusStyle.bg,
                            color: statusStyle.color,
                            fontSize: '0.6rem',
                          }}
                        >
                          {statusStyle.label}
                        </span>
                      </div>
                      <p
                        className="text-xs ml-5"
                        style={{
                          color: 'var(--color-text-secondary)',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical' as const,
                          overflow: 'hidden',
                        }}
                      >
                        {fantasy.description}
                      </p>
                      <div className="flex items-center gap-3 ml-5 mt-1.5">
                        <div className="flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
                          <Clock size={10} />
                          <span style={{ fontSize: '0.6rem' }}>{formatDate(fantasy.created_at)}</span>
                        </div>
                        {fantasy.contributions.length > 0 && (
                          <span style={{ color: 'var(--color-text-muted)', fontSize: '0.6rem' }}>
                            {fantasy.contributions.length} contribution{fantasy.contributions.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Expanded contributions thread */}
                    <AnimatePresence>
                      {expanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="px-3 pb-3"
                          style={{ borderTop: '1px solid var(--color-border-subtle)' }}
                        >
                          <div className="pt-3 space-y-2">
                            {fantasy.contributions.length === 0 && (
                              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                No contributions yet — keep chatting to build this fantasy together
                              </p>
                            )}
                            {fantasy.contributions.map((contrib, i) => (
                              <div
                                key={i}
                                className="rounded-lg p-2.5"
                                style={{
                                  backgroundColor: contrib.author === 'user'
                                    ? 'var(--color-accent-soft)'
                                    : 'var(--color-background)',
                                  marginLeft: contrib.author === 'user' ? 20 : 0,
                                  marginRight: contrib.author === 'character' ? 20 : 0,
                                }}
                              >
                                <div className="flex items-center gap-1 mb-1">
                                  <span
                                    className="text-xs font-medium"
                                    style={{
                                      color: contrib.author === 'user'
                                        ? 'var(--color-accent)'
                                        : 'var(--color-text-primary)',
                                      fontSize: '0.6rem',
                                    }}
                                  >
                                    {contrib.author === 'user' ? 'You' : characterName}
                                  </span>
                                </div>
                                <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                                  {contrib.text}
                                </p>
                              </div>
                            ))}
                          </div>

                          {/* Played-at info */}
                          {fantasy.played_at && (
                            <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)', fontSize: '0.6rem' }}>
                              Last played: {formatDate(fantasy.played_at)}
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
