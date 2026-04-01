/**
 * DesireTree — Secret Desires overlay panel
 *
 * Visualises a character's hidden desires as an RPG-style "skill tree" arranged
 * by category branch. Discovered desires glow with accent-coloured intensity
 * rings; undiscovered nodes are locked, dim, and gently pulse until the player
 * reaches the required bond level.
 *
 * Layout:
 *   - Full-screen overlay (backdrop + centered panel)
 *   - Header: character name, "Secret Desires", discovery progress counter
 *   - Progress bar: discovered / total
 *   - Category branches: collapsible sections, each with a row of desire nodes
 *   - Detail drawer: slides in below the active node showing description + date
 *
 * API:
 *   GET /api/characters/{char_id}/desires
 *
 * Usage:
 *   <DesireTree
 *     isOpen={open}
 *     onClose={() => setOpen(false)}
 *     characterId={1}
 *     characterName="Yuki"
 *   />
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Lock,
  Heart,
  Sparkles,
  Eye,
  TreeDeciduous,
  Star,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertCircle,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════════ */

const BASE = 'http://localhost:8080';

/** Desire categories in display order. */
const CATEGORY_ORDER = [
  'romantic',
  'emotional',
  'playful',
  'adventurous',
  'fantasy',
  'physical',
] as const;

type DesireCategory = typeof CATEGORY_ORDER[number];

/** Icon + label + accent hue for each category branch. */
const CATEGORY_META: Record<DesireCategory, {
  icon: typeof Heart;
  label: string;
  /** HSL hue offset applied to accent for visual differentiation. */
  hue: string;
}> = {
  romantic:    { icon: Heart,        label: 'Romantic',    hue: '340' },
  emotional:   { icon: Eye,          label: 'Emotional',   hue: '200' },
  playful:     { icon: Sparkles,     label: 'Playful',     hue: '50'  },
  adventurous: { icon: TreeDeciduous,label: 'Adventurous', hue: '130' },
  fantasy:     { icon: Star,         label: 'Fantasy',     hue: '270' },
  physical:    { icon: Heart,        label: 'Physical',    hue: '10'  },
};

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

/** Shape of a single desire object from the API. */
interface Desire {
  id: string;
  category: string;
  label: string;
  description: string | null;
  intensity: number;
  discovered: boolean;
  discovered_at: string | null;
  bond_requirement: number;
}

/** Shape of the full API response. */
interface DesiresApiResponse {
  char_id: number;
  desires: Desire[];
}

/* ═══════════════════════════════════════════════════════════════════════
   Props
   ═══════════════════════════════════════════════════════════════════════ */

export interface DesireTreeProps {
  /** Controls overlay visibility. */
  isOpen: boolean;
  /** Called when the user dismisses the overlay. */
  onClose: () => void;
  /** Backend character ID used in the API path. */
  characterId: number;
  /** Display name shown in the header. */
  characterName: string;
}

/* ═══════════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Maps a 1-5 intensity value to an opacity for the desire node glow.
 *
 * @param intensity - 1 (softest) to 5 (most intense)
 * @returns CSS rgba alpha between 0.2 and 1.0
 */
function intensityAlpha(intensity: number): number {
  return 0.2 + (Math.min(5, Math.max(1, intensity)) - 1) * 0.2;
}

/**
 * Formats an ISO date string into a human-friendly label,
 * e.g. "March 15, 2026".
 *
 * @param iso - ISO 8601 date string
 * @returns Formatted date string
 */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Groups an array of desires by category, preserving CATEGORY_ORDER.
 *
 * @param desires - Flat desire array from the API
 * @returns Ordered map of category → desires
 */
function groupByCategory(desires: Desire[]): Map<DesireCategory, Desire[]> {
  const map = new Map<DesireCategory, Desire[]>();
  for (const cat of CATEGORY_ORDER) {
    map.set(cat, []);
  }
  for (const d of desires) {
    const cat = d.category as DesireCategory;
    if (map.has(cat)) {
      map.get(cat)!.push(d);
    } else {
      // Unknown category — append under a fallback bucket (not rendered)
      // Silently skip so the tree never crashes on unexpected data.
    }
  }
  // Remove empty categories so layout stays tight
  for (const [key, val] of map) {
    if (val.length === 0) map.delete(key);
  }
  return map;
}

/* ═══════════════════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Single desire node circle rendered inside a category branch.
 * Discovered nodes glow; locked nodes show a pulsing dim state.
 *
 * @param desire       - The desire data
 * @param isSelected   - Whether this node is currently selected
 * @param hue          - HSL hue string used for the accent ring
 * @param onSelect     - Click handler
 */
function DesireNode({
  desire,
  isSelected,
  hue,
  onSelect,
}: {
  desire: Desire;
  isSelected: boolean;
  hue: string;
  onSelect: () => void;
}) {
  const discovered = desire.discovered;
  const alpha = discovered ? intensityAlpha(desire.intensity) : 0;

  const nodeSize = 52;

  const baseStyle: React.CSSProperties = {
    width: nodeSize,
    height: nodeSize,
    borderRadius: '50%',
    border: `2px solid ${
      isSelected
        ? 'var(--color-accent)'
        : discovered
          ? `hsla(${hue}, 65%, 60%, 0.6)`
          : 'var(--color-border-subtle)'
    }`,
    backgroundColor: discovered
      ? `hsla(${hue}, 60%, 55%, ${alpha})`
      : 'var(--color-bg-secondary)',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: discovered ? 'pointer' : 'default',
    position: 'relative' as const,
    transition: 'all 0.2s ease',
    boxShadow: isSelected
      ? `0 0 14px 3px hsla(${hue}, 65%, 60%, 0.5)`
      : discovered
        ? `0 0 8px 0px hsla(${hue}, 65%, 60%, 0.35)`
        : 'none',
    flexShrink: 0,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '0.52rem',
    color: discovered ? 'var(--color-text)' : 'var(--color-text-tertiary)',
    textAlign: 'center' as const,
    lineHeight: 1.2,
    maxWidth: 44,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    padding: '0 2px',
  };

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}
      aria-label={discovered ? desire.label : `Locked desire — Bond Level ${desire.bond_requirement} required`}
    >
      {/* Node circle */}
      <motion.button
        onClick={discovered ? onSelect : undefined}
        animate={
          discovered
            ? { scale: isSelected ? 1.12 : 1 }
            : { opacity: [0.45, 0.7, 0.45] }
        }
        transition={
          discovered
            ? { type: 'spring', stiffness: 300, damping: 20 }
            : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }
        }
        style={baseStyle}
        aria-pressed={isSelected}
        aria-disabled={!discovered}
      >
        {discovered ? (
          /* Intensity stars at bottom of node */
          <div style={{ display: 'flex', gap: 1, marginTop: 2 }}>
            {Array.from({ length: 5 }, (_, i) => (
              <Star
                key={i}
                size={5}
                style={{
                  color: i < desire.intensity
                    ? `hsla(${hue}, 80%, 65%, 1)`
                    : 'var(--color-border-subtle)',
                  fill: i < desire.intensity ? `hsla(${hue}, 80%, 65%, 1)` : 'transparent',
                }}
              />
            ))}
          </div>
        ) : (
          <>
            <Lock size={14} style={{ color: 'var(--color-text-tertiary)', marginBottom: 2 }} />
            <span
              style={{
                fontSize: '0.48rem',
                color: 'var(--color-text-tertiary)',
                fontWeight: 600,
                letterSpacing: '0.01em',
              }}
            >
              Lv.{desire.bond_requirement}
            </span>
          </>
        )}
      </motion.button>

      {/* Node label */}
      <span style={labelStyle}>
        {discovered ? desire.label : '???'}
      </span>
    </div>
  );
}

/**
 * A single collapsible category branch containing its desire nodes.
 *
 * @param category    - Category key
 * @param desires     - Desires belonging to this category
 * @param selectedId  - Currently selected desire ID (or null)
 * @param onSelect    - Callback when a node is clicked
 */
function CategoryBranch({
  category,
  desires,
  selectedId,
  onSelect,
}: {
  category: DesireCategory;
  desires: Desire[];
  selectedId: string | null;
  onSelect: (desire: Desire) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const meta = CATEGORY_META[category];
  const Icon = meta.icon;
  const discoveredCount = desires.filter(d => d.discovered).length;

  return (
    <div
      style={{
        backgroundColor: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {/* Branch header */}
      <button
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          padding: '10px 14px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--color-text)',
        }}
      >
        {expanded
          ? <ChevronDown size={14} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
          : <ChevronRight size={14} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
        }
        <Icon
          size={14}
          style={{ color: `hsl(${meta.hue}, 65%, 60%)`, flexShrink: 0 }}
        />
        <span
          style={{
            fontSize: '0.78rem',
            fontWeight: 600,
            color: 'var(--color-text)',
            flex: 1,
            textAlign: 'left' as const,
          }}
        >
          {meta.label}
        </span>

        {/* Discovered count badge */}
        <span
          style={{
            fontSize: '0.62rem',
            padding: '2px 8px',
            borderRadius: 10,
            backgroundColor:
              discoveredCount === desires.length
                ? 'var(--color-accent-soft)'
                : 'var(--color-background)',
            color:
              discoveredCount === desires.length
                ? 'var(--color-accent)'
                : 'var(--color-text-tertiary)',
            fontWeight: 600,
            border: '1px solid var(--color-border-subtle)',
          }}
        >
          {discoveredCount}/{desires.length}
        </span>
      </button>

      {/* Node row */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            {/* Connector line */}
            <div
              style={{
                position: 'relative' as const,
                padding: '12px 14px 16px',
              }}
            >
              {/* Horizontal guide rail */}
              {desires.length > 1 && (
                <div
                  style={{
                    position: 'absolute' as const,
                    top: '38px',
                    left: '26px',
                    right: '26px',
                    height: 2,
                    backgroundColor: 'var(--color-border-subtle)',
                    borderRadius: 1,
                    zIndex: 0,
                  }}
                  aria-hidden="true"
                />
              )}

              <div
                style={{
                  display: 'flex',
                  gap: 16,
                  flexWrap: 'wrap' as const,
                  position: 'relative' as const,
                  zIndex: 1,
                }}
              >
                {desires.map(desire => (
                  <DesireNode
                    key={desire.id}
                    desire={desire}
                    isSelected={selectedId === desire.id}
                    hue={meta.hue}
                    onSelect={() => onSelect(desire)}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Detail drawer shown below the node list when a discovered desire is selected.
 * Slides in with a spring transition.
 *
 * @param desire  - The selected discovered desire
 * @param hue     - HSL hue string for the accent bar
 * @param onClose - Callback to deselect
 */
function DesireDetail({
  desire,
  hue,
  onClose,
}: {
  desire: Desire;
  hue: string;
  onClose: () => void;
}) {
  return (
    <motion.div
      key={desire.id}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ type: 'spring', stiffness: 280, damping: 26 }}
      style={{
        backgroundColor: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 12,
        overflow: 'hidden',
        flexShrink: 0,
      }}
      role="region"
      aria-label={`Details for ${desire.label}`}
    >
      {/* Accent bar */}
      <div
        style={{
          height: 3,
          background: `linear-gradient(90deg, hsl(${hue}, 65%, 60%), transparent)`,
        }}
        aria-hidden="true"
      />

      <div style={{ padding: '14px 16px' }}>
        {/* Title row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 8,
            marginBottom: 10,
          }}
        >
          <div>
            <p
              style={{
                fontSize: '0.88rem',
                fontWeight: 700,
                color: 'var(--color-text)',
                lineHeight: 1.3,
              }}
            >
              {desire.label}
            </p>
            {desire.discovered_at && (
              <p
                style={{
                  fontSize: '0.65rem',
                  color: 'var(--color-text-tertiary)',
                  marginTop: 3,
                }}
              >
                Discovered {formatDate(desire.discovered_at)}
              </p>
            )}
          </div>

          {/* Intensity indicator */}
          <div
            style={{
              display: 'flex',
              gap: 3,
              alignItems: 'center',
              flexShrink: 0,
              marginTop: 2,
            }}
          >
            {Array.from({ length: 5 }, (_, i) => (
              <Star
                key={i}
                size={10}
                style={{
                  color: i < desire.intensity
                    ? `hsl(${hue}, 75%, 60%)`
                    : 'var(--color-border-subtle)',
                  fill: i < desire.intensity ? `hsl(${hue}, 75%, 60%)` : 'transparent',
                  transition: 'color 0.15s',
                }}
              />
            ))}
          </div>

          <button
            onClick={onClose}
            aria-label="Close desire detail"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-text-tertiary)',
              padding: 2,
              display: 'flex',
              alignItems: 'center',
              borderRadius: 4,
              transition: 'color 0.15s',
            }}
          >
            <ChevronDown size={14} />
          </button>
        </div>

        {/* Description */}
        {desire.description ? (
          <p
            style={{
              fontSize: '0.8rem',
              color: 'var(--color-text-secondary)',
              lineHeight: 1.65,
              margin: 0,
            }}
          >
            {desire.description}
          </p>
        ) : (
          <p
            style={{
              fontSize: '0.78rem',
              color: 'var(--color-text-tertiary)',
              fontStyle: 'italic',
              margin: 0,
            }}
          >
            No description available.
          </p>
        )}
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   DesireTree — main exported component
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Full-screen overlay panel visualising a character's secret desires as an
 * RPG-style tree of discovered and locked nodes grouped by category.
 *
 * Fetch behaviour:
 *   - Fires GET /api/characters/{characterId}/desires on first open.
 *   - Shows a centered Loader2 spinner while loading.
 *   - Shows an AlertCircle error state if the fetch fails.
 *
 * Interaction:
 *   - Click a discovered node to expand a detail drawer below the tree.
 *   - Click the same node again (or the drawer's close chevron) to collapse.
 *   - Click the backdrop to close the overlay.
 *
 * @param props - {@link DesireTreeProps}
 */
export function DesireTree({
  isOpen,
  onClose,
  characterId,
  characterName,
}: DesireTreeProps) {
  // ── Data state ──
  const [desires, setDesires] = useState<Desire[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── UI state ──
  const [selectedDesire, setSelectedDesire] = useState<Desire | null>(null);

  // ── Fetch desires when opened ──
  const fetchDesires = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/characters/${characterId}/desires`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: DesiresApiResponse = await res.json();
      setDesires(data.desires ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load desires.');
    } finally {
      setLoading(false);
    }
  }, [characterId]);

  useEffect(() => {
    if (isOpen && desires.length === 0 && !loading) {
      fetchDesires();
    }
  }, [isOpen, desires.length, loading, fetchDesires]);

  // Reset selection when overlay closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedDesire(null);
    }
  }, [isOpen]);

  // ── Derived values ──
  const discoveredCount = desires.filter(d => d.discovered).length;
  const totalCount = desires.length;
  const progressPct = totalCount > 0 ? (discoveredCount / totalCount) * 100 : 0;
  const grouped = groupByCategory(desires);

  /**
   * Handles desire node selection — toggles off if already selected.
   *
   * @param desire - The desire that was clicked
   */
  const handleSelectDesire = useCallback((desire: Desire) => {
    setSelectedDesire(prev => (prev?.id === desire.id ? null : desire));
  }, []);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* ── Backdrop ── */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden="true"
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.55)',
              backdropFilter: 'blur(3px)',
              zIndex: 200,
            }}
          />

          {/* ── Panel ── */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`${characterName} — Secret Desires`}
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            style={{
              position: 'fixed',
              inset: '20px',
              zIndex: 201,
              backgroundColor: 'var(--color-surface)',
              borderRadius: 'var(--radius-card, 16px)',
              boxShadow: 'var(--shadow-elevated, 0 24px 80px rgba(0,0,0,0.35))',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* ── Header ── */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '0 20px',
                height: 56,
                flexShrink: 0,
                borderBottom: '1px solid var(--color-border-subtle)',
              }}
            >
              <Heart size={16} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    fontSize: '0.92rem',
                    fontWeight: 700,
                    color: 'var(--color-text)',
                    lineHeight: 1.2,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {characterName}
                  <span
                    style={{
                      fontWeight: 400,
                      color: 'var(--color-text-secondary)',
                      marginLeft: 6,
                    }}
                  >
                    — Secret Desires
                  </span>
                </p>
              </div>

              {/* Discovery count badge */}
              {totalCount > 0 && (
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    padding: '3px 10px',
                    borderRadius: 12,
                    backgroundColor: 'var(--color-accent-soft)',
                    color: 'var(--color-accent)',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                  aria-label={`${discoveredCount} of ${totalCount} desires discovered`}
                >
                  {discoveredCount}/{totalCount} discovered
                </span>
              )}

              {/* Close button */}
              <button
                onClick={onClose}
                aria-label="Close secret desires overlay"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-text-tertiary)',
                  padding: 4,
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'color 0.15s',
                  flexShrink: 0,
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-tertiary)';
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* ── Progress bar ── */}
            {totalCount > 0 && (
              <div
                style={{
                  padding: '10px 20px 0',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    height: 4,
                    backgroundColor: 'var(--color-border-subtle)',
                    borderRadius: 4,
                    overflow: 'hidden',
                  }}
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progressPct)}
                  aria-label="Desire discovery progress"
                >
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPct}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut', delay: 0.15 }}
                    style={{
                      height: '100%',
                      background: 'linear-gradient(90deg, var(--color-accent), var(--color-accent-soft))',
                      borderRadius: 4,
                    }}
                  />
                </div>
                <p
                  style={{
                    fontSize: '0.62rem',
                    color: 'var(--color-text-tertiary)',
                    textAlign: 'right' as const,
                    marginTop: 4,
                  }}
                >
                  {Math.round(progressPct)}% of her secrets uncovered
                </p>
              </div>
            )}

            {/* ── Body ── */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto' as const,
                padding: '14px 20px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {/* Loading state */}
              {loading && (
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 12,
                    padding: '60px 0',
                  }}
                  aria-live="polite"
                  aria-busy="true"
                >
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  >
                    <Loader2 size={28} style={{ color: 'var(--color-accent)' }} />
                  </motion.div>
                  <p
                    style={{
                      fontSize: '0.8rem',
                      color: 'var(--color-text-tertiary)',
                    }}
                  >
                    Reading her heart...
                  </p>
                </div>
              )}

              {/* Error state */}
              {error && !loading && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    padding: '60px 0',
                  }}
                  role="alert"
                >
                  <AlertCircle size={28} style={{ color: 'var(--color-text-tertiary)' }} />
                  <p
                    style={{
                      fontSize: '0.8rem',
                      color: 'var(--color-text-secondary)',
                      textAlign: 'center' as const,
                      maxWidth: 280,
                    }}
                  >
                    {error}
                  </p>
                  <button
                    onClick={fetchDesires}
                    style={{
                      padding: '6px 16px',
                      borderRadius: 8,
                      border: '1px solid var(--color-border-subtle)',
                      backgroundColor: 'var(--color-background)',
                      color: 'var(--color-text-secondary)',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    Try again
                  </button>
                </div>
              )}

              {/* Empty state */}
              {!loading && !error && desires.length === 0 && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    padding: '60px 0',
                    color: 'var(--color-text-tertiary)',
                  }}
                >
                  <Heart size={28} style={{ opacity: 0.4 }} />
                  <p style={{ fontSize: '0.82rem' }}>
                    Her desires haven't been written yet.
                  </p>
                </div>
              )}

              {/* Category branches */}
              {!loading && !error && grouped.size > 0 && (
                <>
                  {Array.from(grouped.entries()).map(([category, catDesires]) => (
                    <CategoryBranch
                      key={category}
                      category={category}
                      desires={catDesires}
                      selectedId={selectedDesire?.id ?? null}
                      onSelect={handleSelectDesire}
                    />
                  ))}

                  {/* Detail drawer */}
                  <AnimatePresence mode="wait">
                    {selectedDesire && selectedDesire.discovered && (
                      <DesireDetail
                        key={selectedDesire.id}
                        desire={selectedDesire}
                        hue={
                          CATEGORY_META[selectedDesire.category as DesireCategory]?.hue ?? '340'
                        }
                        onClose={() => setSelectedDesire(null)}
                      />
                    )}
                  </AnimatePresence>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
