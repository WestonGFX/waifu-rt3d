/**
 * IntimateScenarioBrowser — NSFW Feature: Intimate Scene Selection
 *
 * Full-screen overlay for browsing and selecting intimate scenario templates.
 * Scenarios are fetched from GET /api/scenarios/intimate and filtered client-side
 * by category, intensity range, and search query.
 *
 * Bond-gated scenarios (bond_requirement > currentBondLevel) are rendered as
 * locked cards — visible but unclickable with a lock badge indicating the
 * required bond level.
 *
 * Usage:
 *   <IntimateScenarioBrowser
 *     isOpen={open}
 *     onClose={() => setOpen(false)}
 *     currentBondLevel={character.bond_level}
 *     characterName={character.name}
 *     onSelect={(scenario) => startScenario(scenario)}
 *   />
 *
 * API surface:
 *   GET /api/scenarios/intimate — returns IntimateScenario[]
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Search, Lock, Heart, Flame, Sparkles, Star, Loader2, RotateCcw,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

/** A single intimate scenario template returned by the API. */
export interface IntimateScenario {
  id: string;
  name: string;
  description: string;
  category: 'romantic' | 'playful' | 'passionate' | 'tender' | 'adventurous';
  intensity: 1 | 2 | 3 | 4 | 5;
  bond_requirement: number;
  tags: string[];
}

type Category = 'all' | IntimateScenario['category'];

/* ═══════════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════════ */

/** All browseable category filter chips in display order. */
const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'all',         label: 'All'         },
  { id: 'romantic',    label: 'Romantic'    },
  { id: 'playful',     label: 'Playful'     },
  { id: 'passionate',  label: 'Passionate'  },
  { id: 'tender',      label: 'Tender'      },
  { id: 'adventurous', label: 'Adventurous' },
];

/**
 * Subtle tinted background colors for each scenario category header.
 * These are intentionally hardcoded RGBA values — they are decorative
 * accents, not semantic UI colors, and must remain consistent across themes.
 */
const CATEGORY_TINTS: Record<IntimateScenario['category'], string> = {
  romantic:    'rgba(239, 68,  68,  0.12)',
  playful:     'rgba(251, 191, 36,  0.12)',
  passionate:  'rgba(168, 85,  247, 0.12)',
  tender:      'rgba(59,  130, 246, 0.12)',
  adventurous: 'rgba(34,  197, 94,  0.12)',
};

/**
 * Icon and accent color for each category, used in both the card header
 * and the category chip filter bar.
 */
const CATEGORY_META: Record<
  IntimateScenario['category'],
  { Icon: typeof Heart; accent: string }
> = {
  romantic:    { Icon: Heart,    accent: 'rgb(239,  68,  68)'  },
  playful:     { Icon: Sparkles, accent: 'rgb(251, 191,  36)'  },
  passionate:  { Icon: Flame,    accent: 'rgb(168,  85, 247)'  },
  tender:      { Icon: Star,     accent: 'rgb(59,  130, 246)'  },
  adventurous: { Icon: Flame,    accent: 'rgb(34,  197,  94)'  },
};

/* ═══════════════════════════════════════════════════════════════════════
   IntimateScenarioBrowser
   ═══════════════════════════════════════════════════════════════════════ */

interface IntimateScenarioBrowserProps {
  /** Controls overlay visibility. */
  isOpen: boolean;
  /** Called when the user dismisses the overlay. */
  onClose: () => void;
  /** Current bond level (0–100). Used to gate locked scenarios. Defaults to 0. */
  currentBondLevel?: number;
  /** Optional character name shown in the header subtitle. */
  characterName?: string;
  /** Called with the selected scenario when the user clicks an unlocked card. */
  onSelect?: (scenario: IntimateScenario) => void;
}

/**
 * Full-screen overlay browser for intimate scenario templates.
 *
 * Fetches scenarios from the backend on mount, then filters them entirely
 * client-side using the search query, category chips, and intensity slider.
 * Bond-gated scenarios remain visible but are rendered as locked cards.
 *
 * @param props - See {@link IntimateScenarioBrowserProps}
 *
 * @example
 * ```tsx
 * <IntimateScenarioBrowser
 *   isOpen={showBrowser}
 *   onClose={() => setShowBrowser(false)}
 *   currentBondLevel={character.bond_level}
 *   characterName={character.name}
 *   onSelect={(s) => dispatch({ type: 'START_SCENARIO', payload: s })}
 * />
 * ```
 */
export function IntimateScenarioBrowser({
  isOpen,
  onClose,
  currentBondLevel = 0,
  characterName,
  onSelect,
}: IntimateScenarioBrowserProps) {
  // ── Remote data state ──
  const [scenarios, setScenarios] = useState<IntimateScenario[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Filter state ──
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<Category>('all');
  const [maxIntensity, setMaxIntensity] = useState(5);

  /**
   * Load scenarios from the backend.
   * Only fires when the overlay is open — avoids network traffic when hidden.
   */
  const fetchScenarios = useCallback(async () => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/scenarios/intimate');
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json() as IntimateScenario[];
      setScenarios(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load scenarios');
    } finally {
      setLoading(false);
    }
  }, [isOpen]);

  useEffect(() => { fetchScenarios(); }, [fetchScenarios]);

  // Reset filters when the overlay closes so the next open is a fresh view.
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setActiveCategory('all');
      setMaxIntensity(5);
      setError(null);
    }
  }, [isOpen]);

  /** Client-side filtered and sorted scenario list. */
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return scenarios.filter(s => {
      if (activeCategory !== 'all' && s.category !== activeCategory) return false;
      if (s.intensity > maxIntensity) return false;
      if (q && !s.name.toLowerCase().includes(q) && !s.description.toLowerCase().includes(q)) {
        // Also check tags
        if (!s.tags.some(t => t.toLowerCase().includes(q))) return false;
      }
      return true;
    });
    // Locked scenarios sort to the bottom within each group
  }, [scenarios, query, activeCategory, maxIntensity]);

  const sortedFiltered = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aLocked = a.bond_requirement > currentBondLevel ? 1 : 0;
      const bLocked = b.bond_requirement > currentBondLevel ? 1 : 0;
      return aLocked - bLocked;
    });
  }, [filtered, currentBondLevel]);

  /** Clear all filters and return to the full scenario list. */
  const handleReset = () => {
    setQuery('');
    setActiveCategory('all');
    setMaxIntensity(5);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* ── Backdrop ── */}
          <motion.div
            key="isb-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 200,
              backgroundColor: 'rgba(0, 0, 0, 0.55)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
            }}
          />

          {/* ── Panel ── */}
          <motion.div
            key="isb-panel"
            role="dialog"
            aria-modal="true"
            aria-label={`Intimate Scenarios${characterName ? ` for ${characterName}` : ''}`}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            style={{
              position: 'fixed',
              inset: '16px',
              zIndex: 201,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              backgroundColor: 'var(--color-background)',
              borderRadius: 'var(--radius-card, 16px)',
              border: '1px solid var(--color-border)',
              boxShadow: 'var(--shadow-elevated, 0 24px 64px rgba(0,0,0,0.4))',
            }}
          >
            {/* ═════════════════════════════════════════════
                Header
                ═════════════════════════════════════════════ */}
            <div
              style={{
                padding: '16px 20px 14px',
                borderBottom: '1px solid var(--color-border)',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {/* Title group */}
                <Heart size={16} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: '0.95rem',
                      letterSpacing: '0.04em',
                      color: 'var(--color-text)',
                    }}
                  >
                    Intimate Scenarios
                  </span>
                  {characterName && (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: '0.72rem',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      with {characterName}
                    </span>
                  )}
                </div>

                {/* Count badge */}
                {!loading && scenarios.length > 0 && (
                  <span
                    style={{
                      fontSize: '0.65rem',
                      color: 'var(--color-text-tertiary)',
                      flexShrink: 0,
                    }}
                  >
                    {sortedFiltered.length} / {scenarios.length}
                  </span>
                )}

                {/* Close */}
                <button
                  onClick={onClose}
                  aria-label="Close"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 4,
                    color: 'var(--color-text-tertiary)',
                    borderRadius: 6,
                    flexShrink: 0,
                    transition: 'color 0.15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--color-text)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--color-text-tertiary)'; }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* ── Search bar ── */}
              <div style={{ position: 'relative', marginTop: 12 }}>
                <Search
                  size={14}
                  style={{
                    position: 'absolute',
                    left: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--color-text-tertiary)',
                    pointerEvents: 'none',
                  }}
                />
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search by name, description or tag..."
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '8px 12px 8px 32px',
                    borderRadius: 8,
                    border: '1px solid var(--color-border-subtle)',
                    backgroundColor: 'var(--color-surface)',
                    color: 'var(--color-text)',
                    fontSize: '0.78rem',
                    outline: 'none',
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-accent)'; }}
                  onBlur={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border-subtle)'; }}
                />
              </div>
            </div>

            {/* ═════════════════════════════════════════════
                Filter bar — category chips + intensity
                ═════════════════════════════════════════════ */}
            <div
              style={{
                padding: '10px 20px',
                borderBottom: '1px solid var(--color-border-subtle)',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              {/* Category chips */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
                {CATEGORIES.map(cat => {
                  const active = activeCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setActiveCategory(cat.id)}
                      style={{
                        padding: '4px 12px',
                        borderRadius: 12,
                        border: active
                          ? '1px solid var(--color-accent)'
                          : '1px solid var(--color-border-subtle)',
                        backgroundColor: active
                          ? 'var(--color-accent-soft)'
                          : 'transparent',
                        color: active
                          ? 'var(--color-accent)'
                          : 'var(--color-text-secondary)',
                        fontSize: '0.7rem',
                        fontWeight: active ? 600 : 400,
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {cat.label}
                    </button>
                  );
                })}
              </div>

              {/* Intensity filter */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    fontSize: '0.68rem',
                    color: 'var(--color-text-tertiary)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Up to
                </span>
                <IntensityDots value={maxIntensity} max={5} />
                <input
                  type="range"
                  min={1}
                  max={5}
                  step={1}
                  value={maxIntensity}
                  onChange={e => setMaxIntensity(Number(e.target.value))}
                  aria-label="Maximum intensity level"
                  style={{
                    width: 72,
                    accentColor: 'var(--color-accent)',
                    height: 14,
                    cursor: 'pointer',
                  }}
                />
              </div>
            </div>

            {/* ═════════════════════════════════════════════
                Error banner
                ═════════════════════════════════════════════ */}
            {error && (
              <div
                style={{
                  padding: '8px 20px',
                  borderBottom: '1px solid var(--color-border-subtle)',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  backgroundColor: 'color-mix(in srgb, var(--color-surface) 92%, red 8%)',
                }}
              >
                <Flame size={14} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
                <span
                  style={{
                    fontSize: '0.72rem',
                    color: 'var(--color-text-secondary)',
                    flex: 1,
                  }}
                >
                  {error}
                </span>
                <button
                  onClick={() => setError(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)', padding: 2 }}
                  aria-label="Dismiss error"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* ═════════════════════════════════════════════
                Scrollable card grid
                ═════════════════════════════════════════════ */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '16px 20px',
                scrollbarWidth: 'thin',
              }}
            >
              {loading ? (
                <LoadingState />
              ) : sortedFiltered.length === 0 ? (
                <EmptyState
                  hasFilters={query !== '' || activeCategory !== 'all' || maxIntensity < 5}
                  onReset={handleReset}
                />
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                    gap: 14,
                  }}
                >
                  {sortedFiltered.map(scenario => {
                    const isLocked = scenario.bond_requirement > currentBondLevel;
                    return (
                      <ScenarioCard
                        key={scenario.id}
                        scenario={scenario}
                        isLocked={isLocked}
                        onSelect={onSelect}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            {/* ═════════════════════════════════════════════
                Footer — bond level indicator
                ═════════════════════════════════════════════ */}
            <div
              style={{
                padding: '10px 20px',
                borderTop: '1px solid var(--color-border-subtle)',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Heart size={12} style={{ color: 'var(--color-accent)', opacity: 0.7 }} />
              <span style={{ fontSize: '0.65rem', color: 'var(--color-text-tertiary)' }}>
                Your bond level: <strong style={{ color: 'var(--color-text-secondary)' }}>{currentBondLevel}</strong> / 100
              </span>
              {sortedFiltered.some(s => s.bond_requirement > currentBondLevel) && (
                <span style={{ fontSize: '0.62rem', color: 'var(--color-text-tertiary)', marginLeft: 4 }}>
                  · Some scenarios require a higher bond level
                </span>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   ScenarioCard
   ═══════════════════════════════════════════════════════════════════════ */

interface ScenarioCardProps {
  scenario: IntimateScenario;
  isLocked: boolean;
  onSelect?: (scenario: IntimateScenario) => void;
}

/**
 * Individual scenario card with a category-tinted header, metadata, intensity
 * dots, and an optional lock overlay for bond-gated scenarios.
 *
 * Hover effects are applied via inline event handlers to avoid className usage.
 */
function ScenarioCard({ scenario, isLocked, onSelect }: ScenarioCardProps) {
  const meta = CATEGORY_META[scenario.category];
  const tint = CATEGORY_TINTS[scenario.category];
  const { Icon, accent } = meta;

  /**
   * Handle card click — only fires for unlocked scenarios.
   */
  const handleClick = () => {
    if (isLocked || !onSelect) return;
    onSelect(scenario);
  };

  return (
    <div
      onClick={handleClick}
      role={isLocked ? undefined : 'button'}
      tabIndex={isLocked ? undefined : 0}
      aria-label={isLocked ? `${scenario.name} — locked` : `Select ${scenario.name}`}
      aria-disabled={isLocked}
      onKeyDown={e => { if (!isLocked && (e.key === 'Enter' || e.key === ' ')) handleClick(); }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--color-surface)',
        borderRadius: 'var(--radius-card, 12px)',
        border: '1px solid var(--color-border-subtle)',
        overflow: 'hidden',
        cursor: isLocked ? 'default' : 'pointer',
        opacity: isLocked ? 0.6 : 1,
        transition: 'border-color 0.15s, box-shadow 0.15s, opacity 0.15s',
        outline: 'none',
        position: 'relative',
      }}
      onMouseEnter={e => {
        if (isLocked) return;
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = accent;
        el.style.boxShadow = `0 4px 16px rgba(0,0,0,0.12)`;
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = 'var(--color-border-subtle)';
        el.style.boxShadow = 'none';
      }}
      onFocus={e => {
        if (isLocked) return;
        (e.currentTarget as HTMLElement).style.borderColor = accent;
      }}
      onBlur={e => {
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border-subtle)';
      }}
    >
      {/* ── Category header band ── */}
      <div
        style={{
          padding: '12px 14px 10px',
          backgroundColor: tint,
          borderBottom: '1px solid var(--color-border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Icon size={14} style={{ color: accent, flexShrink: 0 }} />
        <span
          style={{
            fontSize: '0.62rem',
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: accent,
          }}
        >
          {scenario.category}
        </span>
        <div style={{ marginLeft: 'auto' }}>
          <IntensityDots value={scenario.intensity} max={5} accent={accent} size={7} />
        </div>
      </div>

      {/* ── Card body ── */}
      <div
        style={{
          padding: '12px 14px',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: '0.82rem',
            fontWeight: 600,
            color: 'var(--color-text)',
            lineHeight: 1.3,
          }}
        >
          {scenario.name}
        </h3>

        <p
          style={{
            margin: 0,
            fontSize: '0.7rem',
            color: 'var(--color-text-secondary)',
            lineHeight: 1.45,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {scenario.description}
        </p>

        {/* Tags */}
        {scenario.tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
            {scenario.tags.slice(0, 4).map(tag => (
              <span
                key={tag}
                style={{
                  fontSize: '0.58rem',
                  padding: '2px 7px',
                  borderRadius: 6,
                  backgroundColor: 'var(--color-bg-secondary, var(--color-surface))',
                  color: 'var(--color-text-tertiary)',
                  border: '1px solid var(--color-border-subtle)',
                }}
              >
                {tag}
              </span>
            ))}
            {scenario.tags.length > 4 && (
              <span
                style={{
                  fontSize: '0.58rem',
                  color: 'var(--color-text-tertiary)',
                  padding: '2px 4px',
                }}
              >
                +{scenario.tags.length - 4}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Lock overlay ── */}
      {isLocked && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            backgroundColor: 'color-mix(in srgb, var(--color-background) 70%, transparent)',
            borderRadius: 'inherit',
          }}
        >
          <Lock size={20} style={{ color: 'var(--color-text-tertiary)' }} />
          <span
            style={{
              fontSize: '0.65rem',
              fontWeight: 600,
              color: 'var(--color-text-secondary)',
              textAlign: 'center',
              padding: '0 16px',
            }}
          >
            Bond Level {scenario.bond_requirement} Required
          </span>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   IntensityDots — row of filled/empty dots representing 1–5 intensity
   ═══════════════════════════════════════════════════════════════════════ */

interface IntensityDotsProps {
  /** Number of filled dots (current value). */
  value: number;
  /** Total number of dots. */
  max: number;
  /** Optional accent color for filled dots. Falls back to CSS variable. */
  accent?: string;
  /** Dot diameter in pixels. Default 8. */
  size?: number;
}

/**
 * Renders a row of small circular dots to visualize an intensity level.
 * Filled dots use the provided accent color or fall back to `--color-accent`.
 * Empty dots use a muted background.
 */
function IntensityDots({ value, max, accent, size = 8 }: IntensityDotsProps) {
  return (
    <div
      role="img"
      aria-label={`Intensity ${value} of ${max}`}
      style={{ display: 'flex', gap: 3, alignItems: 'center' }}
    >
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            backgroundColor:
              i < value
                ? (accent ?? 'var(--color-accent)')
                : 'var(--color-border)',
            transition: 'background-color 0.15s',
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   LoadingState
   ═══════════════════════════════════════════════════════════════════════ */

/** Centered spinner shown while the scenarios API call is in flight. */
function LoadingState() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '64px 0',
        gap: 12,
        color: 'var(--color-text-tertiary)',
      }}
    >
      <Loader2
        size={28}
        style={{
          animation: 'spin 1s linear infinite',
          color: 'var(--color-accent)',
        }}
      />
      <span style={{ fontSize: '0.78rem' }}>Loading scenarios...</span>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   EmptyState
   ═══════════════════════════════════════════════════════════════════════ */

interface EmptyStateProps {
  /** True when filters are active — changes the message and shows a reset button. */
  hasFilters: boolean;
  /** Callback to clear all active filters. */
  onReset: () => void;
}

/**
 * Shown when the filtered list is empty. Distinguishes between "no filters
 * active but API returned nothing" and "filters eliminated all results".
 */
function EmptyState({ hasFilters, onReset }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '64px 24px',
        gap: 14,
        textAlign: 'center',
      }}
    >
      <Sparkles size={32} style={{ color: 'var(--color-text-tertiary)', opacity: 0.4 }} />
      <p
        style={{
          margin: 0,
          fontSize: '0.82rem',
          fontWeight: 600,
          color: 'var(--color-text-secondary)',
        }}
      >
        {hasFilters ? 'No scenarios match your filters' : 'No scenarios available yet'}
      </p>
      {hasFilters && (
        <>
          <p
            style={{
              margin: 0,
              fontSize: '0.7rem',
              color: 'var(--color-text-tertiary)',
              maxWidth: 280,
              lineHeight: 1.5,
            }}
          >
            Try adjusting your search, category, or intensity level.
          </p>
          <button
            onClick={onReset}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 16px',
              borderRadius: 12,
              border: '1px solid var(--color-border)',
              backgroundColor: 'transparent',
              color: 'var(--color-text-secondary)',
              fontSize: '0.72rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.backgroundColor = 'var(--color-surface)';
              el.style.borderColor = 'var(--color-accent)';
              el.style.color = 'var(--color-accent)';
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.backgroundColor = 'transparent';
              el.style.borderColor = 'var(--color-border)';
              el.style.color = 'var(--color-text-secondary)';
            }}
          >
            <RotateCcw size={13} />
            Reset filters
          </button>
        </>
      )}
    </div>
  );
}
