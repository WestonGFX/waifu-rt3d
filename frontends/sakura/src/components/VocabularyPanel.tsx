/**
 * VocabularyPanel — Feature F30: Private Vocabulary & Pet Names
 *
 * Read-only panel showing the private language between user and character.
 * Terms are grouped by category: pet names, shared references, inside jokes, code words.
 * Users can delete terms but NOT add them (vocabulary grows organically from chat).
 *
 * Design: warm, intimate feel. Each term shown as a card with origin story.
 *
 * API:
 *   GET    /api/characters/{charId}/vocabulary  → VocabTerm[] + VocabStats
 *   DELETE /api/characters/{charId}/vocabulary/{termId}  → { ok: true }
 *
 * @example
 * // In sidebar: openOverlay('vocab')
 * // Keyboard shortcut: alt+v
 */

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Heart, Bookmark, Smile, Lock, Trash2, MessageCircle, Loader2,
} from 'lucide-react';
import { useAppStore } from '../stores/appStore';

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

/** Which side of the relationship coined the term. */
type TermOrigin = 'user' | 'character' | 'mutual';

/** Category of a private vocabulary term. */
type TermCategory = 'pet_name' | 'reference' | 'joke' | 'code_word';

/**
 * A single private vocabulary term shared between user and character.
 * Returned by GET /api/characters/{charId}/vocabulary.
 */
interface PrivateTerm {
  /** Primary key, used for DELETE. */
  id: number;
  /** The actual word or phrase. */
  term: string;
  /** Human-readable explanation of what it means. */
  meaning: string;
  /** Optional story about how this term originated. */
  origin_story?: string;
  /** Who introduced the term. */
  origin: TermOrigin;
  /** How many times it has appeared in chat. */
  usage_count: number;
  /** ISO date string when the term was first used. */
  first_used_at: string;
  /** Which bucket this term belongs to. */
  category: TermCategory;
}

/**
 * Aggregate stats returned alongside the terms list.
 * Allows the stats bar at the top to render without iterating.
 */
interface VocabStats {
  total: number;
  pet_names: number;
  references: number;
  jokes: number;
  code_words: number;
}

/** Full response shape from GET /api/characters/{charId}/vocabulary. */
interface VocabResponse {
  ok: boolean;
  terms: PrivateTerm[];
  stats: VocabStats;
}

/* ═══════════════════════════════════════════════════════════════════════
   Category metadata
   ═══════════════════════════════════════════════════════════════════════ */

interface CategoryMeta {
  label: string;
  /** Lucide icon element, pre-sized. */
  icon: ReactNode;
  /** Accent colour for the category header and icon. */
  color: string;
  /** Stats key for the count badge. */
  statsKey: keyof VocabStats;
}

const CATEGORIES: Record<TermCategory, CategoryMeta> = {
  pet_name:  { label: 'Pet Names',         icon: <Heart     size={13} />, color: '#e9729f', statsKey: 'pet_names'  },
  reference: { label: 'Shared References', icon: <Bookmark  size={13} />, color: '#7c8cf5', statsKey: 'references' },
  joke:      { label: 'Inside Jokes',      icon: <Smile     size={13} />, color: '#f59e0b', statsKey: 'jokes'      },
  code_word: { label: 'Code Words',        icon: <Lock      size={13} />, color: '#39c96e', statsKey: 'code_words' },
};

/** Display order for category sections. */
const CATEGORY_ORDER: TermCategory[] = ['pet_name', 'reference', 'joke', 'code_word'];

/* ═══════════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Returns a human-readable relative date string like "2 weeks ago"
 * or "3 months ago". Falls back to the locale date string if the
 * date cannot be parsed.
 *
 * @param isoDate - ISO 8601 date string
 * @returns Relative date string
 *
 * @example
 *   relativeDate('2026-03-01T00:00:00Z') // "4 weeks ago"
 */
function relativeDate(isoDate: string): string {
  try {
    const now = Date.now();
    const then = new Date(isoDate).getTime();
    const diffMs = now - then;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 1)  return 'today';
    if (diffDays < 7)  return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    const weeks = Math.floor(diffDays / 7);
    if (weeks < 5)     return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
    const months = Math.floor(diffDays / 30);
    if (months < 12)   return `${months} month${months !== 1 ? 's' : ''} ago`;
    const years = Math.floor(diffDays / 365);
    return `${years} year${years !== 1 ? 's' : ''} ago`;
  } catch {
    return new Date(isoDate).toLocaleDateString();
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   Shared style tokens
   ═══════════════════════════════════════════════════════════════════════ */

const cardStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-background)',
  border: '1px solid var(--color-border-subtle)',
  borderRadius: 10,
};

/* ═══════════════════════════════════════════════════════════════════════
   TermCard — individual term display
   ═══════════════════════════════════════════════════════════════════════ */

interface TermCardProps {
  term: PrivateTerm;
  charName: string;
  /** Called when the user confirms a delete. */
  onDelete: (id: number) => void;
}

/**
 * Single vocabulary term rendered as a card.
 *
 * Delete flow uses a two-step confirmation:
 *  1. First click: button turns red / shows "confirm?" label.
 *  2. Second click (within 3 s): delete fires.
 *  3. No second click: state resets after 3 s.
 */
function TermCard({ term, charName, onDelete }: TermCardProps) {
  const [pendingDelete, setPendingDelete] = useState(false);
  const [hovered, setHovered] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Handle the first / second click of the two-step delete. */
  const handleDeleteClick = useCallback(() => {
    if (!pendingDelete) {
      setPendingDelete(true);
      // Auto-reset after 3 s if user changes their mind
      timeoutRef.current = setTimeout(() => setPendingDelete(false), 3000);
    } else {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      onDelete(term.id);
    }
  }, [pendingDelete, onDelete, term.id]);

  // Clean up the timeout on unmount
  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  /** Origin badge colour and label. */
  const originBadge = (origin: TermOrigin, charName: string): { label: string; color: string } => {
    switch (origin) {
      case 'user':      return { label: 'by you',       color: 'var(--color-accent)' };
      case 'character': return { label: `by ${charName}`, color: '#e9729f' };
      case 'mutual':    return { label: 'mutual',        color: '#9c6fe4' };
    }
  };

  const badge = originBadge(term.origin, charName);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...cardStyle,
        padding: '10px 12px',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        borderColor: hovered ? 'var(--color-border)' : 'var(--color-border-subtle)',
        boxShadow: hovered ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
      }}
    >
      {/* Top row: term + delete button */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '0.95rem',
            fontStyle: 'italic',
            fontWeight: 500,
            color: 'var(--color-text-primary)',
            lineHeight: 1.3,
          }}
        >
          "{term.term}"
        </span>

        <button
          onClick={handleDeleteClick}
          title={pendingDelete ? 'Click again to confirm' : 'Remove term'}
          style={{
            background: 'none',
            border: '1px solid',
            borderColor: pendingDelete ? '#e9729f' : 'transparent',
            borderRadius: 6,
            padding: '3px 6px',
            cursor: 'pointer',
            color: pendingDelete ? '#e9729f' : 'var(--color-text-tertiary)',
            fontSize: '0.65rem',
            fontWeight: pendingDelete ? 600 : 400,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            flexShrink: 0,
            transition: 'all 0.15s',
            opacity: hovered || pendingDelete ? 1 : 0,
          }}
        >
          <Trash2 size={11} />
          {pendingDelete ? 'confirm?' : ''}
        </button>
      </div>

      {/* Meaning */}
      <p
        style={{
          fontSize: '0.78rem',
          color: 'var(--color-text-secondary)',
          marginTop: 4,
          lineHeight: 1.45,
        }}
      >
        {term.meaning}
      </p>

      {/* Origin story (optional) */}
      {term.origin_story && (
        <p
          style={{
            fontSize: '0.7rem',
            color: 'var(--color-text-tertiary)',
            marginTop: 4,
            fontStyle: 'italic',
            lineHeight: 1.4,
          }}
        >
          {term.origin_story}
        </p>
      )}

      {/* Meta row: usage count + origin badge + first used */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 7,
          flexWrap: 'wrap',
        }}
      >
        {/* Usage count */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: '0.65rem', color: 'var(--color-text-tertiary)',
          }}
        >
          <MessageCircle size={10} />
          <span>Used {term.usage_count.toLocaleString()} time{term.usage_count !== 1 ? 's' : ''}</span>
        </div>

        {/* Origin badge */}
        <span
          style={{
            fontSize: '0.62rem',
            fontWeight: 600,
            paddingInline: 6,
            paddingBlock: 2,
            borderRadius: 20,
            backgroundColor: `color-mix(in srgb, ${badge.color} 12%, transparent)`,
            color: badge.color,
            border: `1px solid color-mix(in srgb, ${badge.color} 25%, transparent)`,
          }}
        >
          {badge.label}
        </span>

        {/* First used date */}
        <span
          style={{
            fontSize: '0.62rem',
            color: 'var(--color-text-tertiary)',
            marginLeft: 'auto',
          }}
        >
          {relativeDate(term.first_used_at)}
        </span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   CategorySection — group of terms under a single category header
   ═══════════════════════════════════════════════════════════════════════ */

interface CategorySectionProps {
  category: TermCategory;
  terms: PrivateTerm[];
  charName: string;
  onDelete: (id: number) => void;
}

/**
 * Renders a collapsible section header followed by term cards.
 * Starts expanded; user can toggle collapse by clicking the header.
 */
function CategorySection({ category, terms, charName, onDelete }: CategorySectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const meta = CATEGORIES[category];

  if (terms.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Section header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '6px 0',
          marginBottom: collapsed ? 0 : 6,
          textAlign: 'left',
        }}
      >
        {/* Icon in tinted circle */}
        <div
          style={{
            width: 22, height: 22, borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: `color-mix(in srgb, ${meta.color} 14%, transparent)`,
            color: meta.color,
            flexShrink: 0,
          }}
        >
          {meta.icon}
        </div>

        <span
          style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            color: 'var(--color-text-primary)',
          }}
        >
          {meta.label}
        </span>

        {/* Count badge */}
        <span
          style={{
            fontSize: '0.6rem',
            fontWeight: 700,
            paddingInline: 6,
            paddingBlock: 2,
            borderRadius: 20,
            backgroundColor: `color-mix(in srgb, ${meta.color} 14%, transparent)`,
            color: meta.color,
          }}
        >
          {terms.length}
        </span>

        {/* Collapse chevron */}
        <span
          style={{
            marginLeft: 'auto',
            fontSize: '0.65rem',
            color: 'var(--color-text-tertiary)',
            transform: collapsed ? 'rotate(-90deg)' : 'none',
            transition: 'transform 0.15s',
          }}
        >
          ▾
        </span>
      </button>

      {/* Term cards */}
      {!collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 4 }}>
          {terms.map(t => (
            <TermCard key={t.id} term={t} charName={charName} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   StatsBar — summary row at the top of the panel
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Renders a single-line summary like "12 terms · 5 pet names · 3 refs · 2 jokes · 2 code words".
 * Only shows non-zero categories.
 */
function StatsBar({ stats }: { stats: VocabStats }) {
  const parts: string[] = [`${stats.total} term${stats.total !== 1 ? 's' : ''}`];
  if (stats.pet_names  > 0) parts.push(`${stats.pet_names} pet name${stats.pet_names  !== 1 ? 's' : ''}`);
  if (stats.references > 0) parts.push(`${stats.references} ref${stats.references    !== 1 ? 's' : ''}`);
  if (stats.jokes      > 0) parts.push(`${stats.jokes} joke${stats.jokes             !== 1 ? 's' : ''}`);
  if (stats.code_words > 0) parts.push(`${stats.code_words} code word${stats.code_words !== 1 ? 's' : ''}`);

  return (
    <p
      style={{
        fontSize: '0.7rem',
        color: 'var(--color-text-tertiary)',
        lineHeight: 1.4,
      }}
    >
      {parts.join(' · ')}
    </p>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   VocabularyPanel — main export
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Right slide-in panel for Feature F30: Private Vocabulary & Pet Names.
 *
 * Renders as a right slide-in overlay (420px wide).
 * Opens when `activeOverlay === 'vocab'`.
 *
 * Fetches vocabulary from GET /api/characters/{charId}/vocabulary on open.
 * Handles DELETE /api/characters/{charId}/vocabulary/{termId} per term.
 *
 * @example
 * // In sidebar: openOverlay('vocab')
 * // Keyboard shortcut: alt+v
 */
export function VocabularyPanel() {
  const { activeOverlay, closeOverlay, activeCharacter } = useAppStore();
  const open = activeOverlay === 'vocabulary';

  const charId   = activeCharacter?.id   ?? 0;
  const charName = activeCharacter?.name ?? 'Character';

  const [terms, setTerms]   = useState<PrivateTerm[]>([]);
  const [stats, setStats]   = useState<VocabStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  /** Fetch vocabulary when the panel opens or the character changes. */
  useEffect(() => {
    if (!open || !charId) return;

    setLoading(true);
    setError(null);

    fetch(`/api/characters/${charId}/vocabulary`)
      .then(res => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<VocabResponse>;
      })
      .then(data => {
        setTerms(data.terms ?? []);
        setStats(data.stats ?? null);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Could not load vocabulary (${msg})`);
      })
      .finally(() => setLoading(false));
  }, [open, charId]);

  /**
   * Remove a term from the panel and call the DELETE endpoint.
   * Optimistically removes from local state first; restores on failure.
   *
   * @param id - Primary key of the term to remove.
   */
  const handleDelete = useCallback((id: number) => {
    const previous = terms;

    // Optimistic removal
    setTerms(prev => prev.filter(t => t.id !== id));
    if (stats) {
      const deleted = previous.find(t => t.id === id);
      if (deleted) {
        const catKey: Record<TermCategory, keyof VocabStats> = {
          pet_name:  'pet_names',
          reference: 'references',
          joke:      'jokes',
          code_word: 'code_words',
        };
        setStats(prev => prev ? {
          ...prev,
          total: Math.max(0, prev.total - 1),
          [catKey[deleted.category as TermCategory]]: Math.max(
            0,
            (prev[catKey[deleted.category as TermCategory]] as number) - 1,
          ),
        } : prev);
      }
    }

    fetch(`/api/characters/${charId}/vocabulary/${id}`, { method: 'DELETE' })
      .then(res => {
        if (!res.ok) throw new Error(`${res.status}`);
      })
      .catch(() => {
        // Restore on failure
        setTerms(previous);
      });
  }, [terms, stats, charId]);

  /** Group terms by category for section rendering. */
  const grouped = CATEGORY_ORDER.reduce<Record<TermCategory, PrivateTerm[]>>(
    (acc, cat) => {
      acc[cat] = terms.filter(t => t.category === cat);
      return acc;
    },
    { pet_name: [], reference: [], joke: [], code_word: [] },
  );

  const hasAnyTerms = terms.length > 0;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            exit={{ opacity: 0 }}
            onClick={closeOverlay}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: '#000',
              zIndex: 200,
            }}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            role="dialog"
            aria-modal="true"
            aria-label="Our Vocabulary"
            style={{
              position: 'fixed',
              right: 0, top: 0, bottom: 0,
              width: 'min(420px, 92vw)',
              backgroundColor: 'var(--color-surface)',
              borderLeft: '1px solid var(--color-border-subtle)',
              boxShadow: '-8px 0 32px rgba(0,0,0,0.18)',
              zIndex: 210,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* ── Header ─────────────────────────────────────── */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 16px',
                height: 48,
                flexShrink: 0,
                borderBottom: '1px solid var(--color-border-subtle)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Heart size={15} style={{ color: '#e9729f' }} />
                <span
                  style={{
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    color: 'var(--color-text-primary)',
                  }}
                >
                  Our Vocabulary
                </span>
              </div>

              <button
                onClick={closeOverlay}
                aria-label="Close vocabulary panel"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-text-tertiary)',
                  padding: 6,
                  borderRadius: 8,
                  transition: 'color 0.15s',
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* ── Stats bar ──────────────────────────────────── */}
            {stats && !loading && (
              <div
                style={{
                  padding: '8px 16px',
                  borderBottom: '1px solid var(--color-border-subtle)',
                  flexShrink: 0,
                }}
              >
                <StatsBar stats={stats} />
              </div>
            )}

            {/* ── Content ────────────────────────────────────── */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              {/* Loading state */}
              {loading && (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '48px 0',
                    color: 'var(--color-text-tertiary)',
                  }}
                >
                  <Loader2
                    size={22}
                    className="animate-spin"
                    style={{ margin: '0 auto 10px', display: 'block' }}
                  />
                  <p style={{ fontSize: '0.8rem' }}>Loading vocabulary...</p>
                </div>
              )}

              {/* Error state */}
              {!loading && error && (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '32px 0',
                    color: 'var(--color-text-tertiary)',
                  }}
                >
                  <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                    {error}
                  </p>
                  <p style={{ fontSize: '0.72rem', marginTop: 4 }}>
                    Make sure the server is running.
                  </p>
                </div>
              )}

              {/* No character selected */}
              {!loading && !error && !activeCharacter && (
                <p
                  style={{
                    textAlign: 'center',
                    padding: '40px 0',
                    fontSize: '0.82rem',
                    color: 'var(--color-text-tertiary)',
                  }}
                >
                  Select a character to see your shared vocabulary.
                </p>
              )}

              {/* Empty state */}
              {!loading && !error && activeCharacter && !hasAnyTerms && (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '48px 16px',
                    color: 'var(--color-text-tertiary)',
                  }}
                >
                  <Heart
                    size={32}
                    style={{
                      margin: '0 auto 12px',
                      display: 'block',
                      opacity: 0.25,
                      color: '#e9729f',
                    }}
                  />
                  <p
                    style={{
                      fontSize: '0.88rem',
                      color: 'var(--color-text-secondary)',
                      fontWeight: 500,
                      marginBottom: 6,
                    }}
                  >
                    No shared vocabulary yet.
                  </p>
                  <p
                    style={{
                      fontSize: '0.76rem',
                      lineHeight: 1.55,
                      maxWidth: 260,
                      margin: '0 auto',
                    }}
                  >
                    Keep chatting — your private language with {charName} will grow naturally.
                  </p>
                </div>
              )}

              {/* Category sections */}
              {!loading && !error && hasAnyTerms && (
                <>
                  {/* Subtitle under stats */}
                  <div style={{ marginBottom: 4 }}>
                    <h3
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '1rem',
                        fontWeight: 300,
                        fontStyle: 'italic',
                        color: 'var(--color-text-primary)',
                        marginBottom: 2,
                      }}
                    >
                      You & {charName}
                    </h3>
                    <p style={{ fontSize: '0.7rem', color: 'var(--color-text-tertiary)' }}>
                      Words and phrases that only you two understand
                    </p>
                  </div>

                  {CATEGORY_ORDER.map(cat => (
                    <CategorySection
                      key={cat}
                      category={cat}
                      terms={grouped[cat]}
                      charName={charName}
                      onDelete={handleDelete}
                    />
                  ))}
                </>
              )}
            </div>

            {/* ── Footer note ────────────────────────────────── */}
            {!loading && hasAnyTerms && (
              <div
                style={{
                  padding: '8px 16px',
                  borderTop: '1px solid var(--color-border-subtle)',
                  flexShrink: 0,
                }}
              >
                <p style={{ fontSize: '0.63rem', color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
                  Vocabulary grows organically as you chat. You can remove terms you no longer want.
                </p>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
