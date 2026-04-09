/**
 * BondTimeline — vertical milestone history for a character's bond progression.
 *
 * Fetches achieved milestones and unlock data from the API, merges them into a
 * single chronological list, and renders a scrollable vertical timeline. Items
 * slide in with a staggered Framer Motion animation. Tier transitions get a
 * prominent diamond node; locked future milestones are shown grayed with dashed
 * borders so the user can see what's coming.
 *
 * Works across all 18 themes (9 light / 9 dark) — all colors use CSS variables.
 *
 * @module BondTimeline
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Star,
  Crown,
  BookOpen,
  Smile,
  MessageCircle,
  Zap,
  Circle,
  Lock,
} from 'lucide-react';
import { api } from '../lib/api';

/* ═══════════════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Stagger delay (seconds) between each timeline item animating in.
 * Produces a natural cascading reveal rather than all items popping at once.
 */
const ITEM_STAGGER_S = 0.05;

/** Accent color per bond tier — mirrors BondProgressBar / LevelUpCelebration. */
const TIER_COLORS: Record<string, string> = {
  stranger:     'var(--color-text-tertiary)',
  acquaintance: '#60a5fa',
  friend:       '#34d399',
  close_friend: '#a78bfa',
  soulmate:     '#fbbf24',
};

/** Human-readable tier labels. */
const TIER_LABELS: Record<string, string> = {
  stranger:     'Stranger',
  acquaintance: 'Acquaintance',
  friend:       'Friend',
  close_friend: 'Close Friend',
  soulmate:     'Soulmate',
};

/* ═══════════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * A single entry in the merged timeline array.
 * Both achieved milestones and upcoming locked items share this shape;
 * the `locked` flag controls the visual treatment.
 */
interface TimelineItem {
  /** Unique key for React reconciliation. */
  id: string;
  /** Bond level at which this item was/will be reached. */
  level: number;
  /** Milestone category — drives icon selection. */
  type: 'level_up' | 'tier_transition' | 'story_unlock' | 'expression_unlock' | 'greeting_unlock' | 'feature_unlock' | string;
  /** Human-readable description text rendered below the level badge. */
  label: string;
  /**
   * ISO date string for achieved items, undefined for locked upcoming items.
   * Rendered as a short locale date when present.
   */
  achievedAt?: string;
  /** True when this item is in the future and not yet unlocked. */
  locked: boolean;
  /**
   * Database milestone ID, present for story_unlock items.
   * Passed to `onStoryClick` so the parent can open the story reader.
   */
  storyId?: number;
  /** For tier_transition items, the tier key reached at this level. */
  toTier?: string;
}

/**
 * Raw milestone shape returned by `api.getBondMilestones`.
 */
interface RawMilestone {
  id: number;
  milestone_type: string;
  milestone_key: string;
  bond_level: number;
  achieved_at: string;
  viewed: number;
}

/**
 * Raw unlock shape returned by `api.getBondUnlocks`.
 */
interface RawUnlock {
  type: string;
  key: string;
  label: string;
  level: number;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Props
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Props for the {@link BondTimeline} component.
 *
 * @example
 * ```tsx
 * <BondTimeline
 *   charId={3}
 *   currentLevel={12}
 *   currentTier="friend"
 *   onStoryClick={(id, title) => openStoryModal(id, title)}
 * />
 * ```
 */
export interface BondTimelineProps {
  /** Active character ID used for API calls. */
  charId: number;
  /** Current bond level — used to distinguish achieved vs locked items. */
  currentLevel: number;
  /** Current tier key — used to color tier-transition nodes. */
  currentTier: string;
  /**
   * Called when the user clicks a story-unlock node.
   *
   * @param storyId - The milestone database row ID.
   * @param title   - Human-readable story title for the reader header.
   */
  onStoryClick?: (storyId: number, title: string) => void;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Returns the Lucide icon component for a given milestone type.
 *
 * Mapping:
 * - level_up          → Star
 * - tier_transition   → Crown
 * - story_unlock      → BookOpen
 * - expression_unlock → Smile
 * - greeting_unlock   → MessageCircle
 * - feature_unlock    → Zap
 * - (fallback)        → Circle
 *
 * @param type - Milestone type string from the API.
 * @param size - Icon size in pixels (default 14).
 */
function MilestoneIcon({ type, size = 14 }: { type: string; size?: number }) {
  switch (type) {
    case 'level_up':          return <Star          size={size} aria-hidden />;
    case 'tier_transition':   return <Crown         size={size} aria-hidden />;
    case 'story_unlock':      return <BookOpen      size={size} aria-hidden />;
    case 'expression_unlock': return <Smile         size={size} aria-hidden />;
    case 'greeting_unlock':   return <MessageCircle size={size} aria-hidden />;
    case 'feature_unlock':    return <Zap           size={size} aria-hidden />;
    default:                  return <Circle        size={size} aria-hidden />;
  }
}

/**
 * Formats an ISO date string to a short locale date (e.g. "Apr 2, 2026").
 * Returns an empty string when the input is falsy.
 *
 * @param iso - ISO 8601 date string or empty/undefined.
 * @returns Locale-formatted short date.
 */
function fmtDate(iso: string | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

/**
 * Derives a human-readable label for a raw milestone record.
 * Uses `milestone_key` with underscores replaced by spaces as a fallback
 * when no better label is available from the API.
 *
 * @param m - Raw milestone row.
 * @returns Display label string.
 */
function milestoneLabel(m: RawMilestone): string {
  // The backend stores the key as a snake_case identifier.
  // Replace underscores and title-case for a readable default.
  return m.milestone_key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Merges raw milestones and raw unlock rows into a sorted timeline array.
 *
 * Strategy:
 * 1. Convert each achieved milestone to a TimelineItem (locked = false).
 * 2. Add upcoming unlock rows whose level > currentLevel as locked items,
 *    but skip any level already represented by an achieved milestone so we
 *    never show duplicates.
 * 3. Sort ascending by level, then by `locked` (achieved first at same level).
 *
 * @param milestones   - Achieved milestone rows from the API.
 * @param unlocks      - All unlock rows (past + future) from the API.
 * @param currentLevel - The character's current bond level.
 * @returns Sorted, deduplicated timeline items.
 */
function buildTimeline(
  milestones: RawMilestone[],
  unlocks: RawUnlock[],
  currentLevel: number,
): TimelineItem[] {
  const items: TimelineItem[] = [];
  const achievedLevels = new Set<number>();

  // ── Achieved milestones ────────────────────────────────────────────────
  for (const m of milestones) {
    achievedLevels.add(m.bond_level);
    items.push({
      id:          `milestone-${m.id}`,
      level:       m.bond_level,
      type:        m.milestone_type,
      label:       milestoneLabel(m),
      achievedAt:  m.achieved_at,
      locked:      false,
      storyId:     m.milestone_type === 'story_unlock' ? m.id : undefined,
    });
  }

  // ── Upcoming locked unlocks ────────────────────────────────────────────
  for (const u of unlocks) {
    if (u.level <= currentLevel) continue;       // already past — milestone should cover it
    if (achievedLevels.has(u.level)) continue;   // milestone row exists for this level
    items.push({
      id:     `unlock-${u.key}-${u.level}`,
      level:  u.level,
      type:   u.type,
      label:  u.label,
      locked: true,
    });
  }

  // ── Sort: level ascending, achieved before locked at same level ────────
  items.sort((a, b) => {
    if (a.level !== b.level) return a.level - b.level;
    return Number(a.locked) - Number(b.locked);
  });

  return items;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The circular (or diamond) node rendered on the left rail of the timeline.
 * Tier-transition milestones use a rotated square (diamond) shape with a gold
 * accent. All other achieved nodes use a filled circle in the theme accent
 * color. Locked nodes render with a dashed border and no fill.
 *
 * @param type   - Milestone type, used to select diamond vs circle.
 * @param locked - Whether this node is for a future/locked milestone.
 * @param tier   - Optional tier key for tier_transition nodes (colors the node).
 */
function TimelineNode({
  type,
  locked,
  tier,
}: {
  type: string;
  locked: boolean;
  tier?: string;
}) {
  const isTierTransition = type === 'tier_transition';
  const nodeColor = locked
    ? 'transparent'
    : isTierTransition
      ? (tier ? (TIER_COLORS[tier] ?? '#fbbf24') : '#fbbf24')
      : 'var(--color-accent)';
  const borderColor = locked
    ? 'var(--color-border)'
    : nodeColor;
  const iconColor = locked
    ? 'var(--color-text-tertiary)'
    : '#fff';

  return (
    <div
      style={{
        flexShrink: 0,
        width:          isTierTransition ? 22 : 20,
        height:         isTierTransition ? 22 : 20,
        borderRadius:   isTierTransition ? 4 : '50%',
        transform:      isTierTransition ? 'rotate(45deg)' : undefined,
        backgroundColor: nodeColor,
        border:         `2px ${locked ? 'dashed' : 'solid'} ${borderColor}`,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        color:          iconColor,
        boxShadow:      !locked && isTierTransition
          ? `0 0 8px color-mix(in srgb, ${nodeColor} 55%, transparent)`
          : !locked
            ? `0 0 6px color-mix(in srgb, var(--color-accent) 40%, transparent)`
            : 'none',
        zIndex:         1,
      }}
      aria-hidden
    >
      {/* Un-rotate the icon so it stays upright inside the diamond */}
      <span style={{ transform: isTierTransition ? 'rotate(-45deg)' : undefined, display: 'flex' }}>
        <MilestoneIcon type={type} size={10} />
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   BondTimeline
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * BondTimeline — scrollable vertical timeline of bond milestones.
 *
 * On mount, fetches the character's milestone history and full unlock table via
 * the API, then merges them into a single chronological list. Items animate in
 * with a 50ms stagger. Locked/future items are shown grayed out with dashed
 * nodes so the user can see what lies ahead.
 *
 * Tier-transition items get a gold diamond node and a tier-arrow badge.
 * Story-unlock items render a "Read" button that fires `onStoryClick`.
 *
 * @param charId       - Character ID for API calls.
 * @param currentLevel - Character's current bond level.
 * @param currentTier  - Character's current tier key.
 * @param onStoryClick - Optional callback when a story node is clicked.
 *
 * @example
 * ```tsx
 * <BondTimeline
 *   charId={activeCharId}
 *   currentLevel={bondLevel}
 *   currentTier={bondTier}
 *   onStoryClick={(id, title) => openStoryModal(id, title)}
 * />
 * ```
 */
export function BondTimeline({
  charId,
  currentLevel,
  currentTier,
  onStoryClick,
}: BondTimelineProps) {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Data fetch ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!charId) return;
    let cancelled = false;

    setLoading(true);
    setError(null);

    Promise.all([
      api.getBondMilestones(charId),
      api.getBondUnlocks(charId),
    ])
      .then(([milestonesRes, unlocksRes]) => {
        if (cancelled) return;
        const merged = buildTimeline(
          milestonesRes.milestones ?? [],
          unlocksRes.unlocked ?? [],
          currentLevel,
        );
        setItems(merged);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError('Could not load timeline.');
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [charId, currentLevel]);

  // ── Loading state ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div
        style={{
          padding: '24px 0',
          textAlign: 'center',
          color: 'var(--color-text-tertiary)',
          fontSize: 12,
        }}
        aria-live="polite"
        aria-label="Loading bond timeline"
      >
        Loading timeline…
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────
  if (error) {
    return (
      <div
        style={{
          padding: '24px 0',
          textAlign: 'center',
          color: 'var(--color-text-tertiary)',
          fontSize: 12,
        }}
        role="alert"
      >
        {error}
      </div>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <div
        style={{
          padding: '24px 0',
          textAlign: 'center',
          color: 'var(--color-text-tertiary)',
          fontSize: 12,
        }}
      >
        No milestones yet — keep chatting to build your bond!
      </div>
    );
  }

  // ── Timeline ──────────────────────────────────────────────────────────
  return (
    <div
      style={{
        maxHeight: 480,
        overflowY: 'auto',
        overflowX: 'hidden',
        paddingRight: 4,
        // Custom scrollbar — thin and theme-aware
        scrollbarWidth: 'thin',
        scrollbarColor: 'var(--color-border) transparent',
      }}
      aria-label="Bond milestone timeline"
      role="list"
    >
      <AnimatePresence initial>
        {items.map((item, index) => {
          const isTierTransition = item.type === 'tier_transition';
          const isStory          = item.type === 'story_unlock';
          const isLast           = index === items.length - 1;
          const dateStr          = fmtDate(item.achievedAt);

          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ delay: index * ITEM_STAGGER_S, duration: 0.28, ease: 'easeOut' }}
              role="listitem"
              aria-label={`Level ${item.level}: ${item.label}${item.locked ? ' — locked' : dateStr ? `, ${dateStr}` : ''}`}
              style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}
            >
              {/* ── Rail column ── */}
              <div
                style={{
                  display:        'flex',
                  flexDirection:  'column',
                  alignItems:     'center',
                  width:          32,
                  flexShrink:     0,
                  paddingTop:     4,
                }}
              >
                <TimelineNode
                  type={item.type}
                  locked={item.locked}
                  tier={item.toTier ?? currentTier}
                />
                {/* Connector line — hidden for the last item */}
                {!isLast && (
                  <div
                    style={{
                      flex:            1,
                      width:           2,
                      minHeight:       24,
                      backgroundColor: item.locked
                        ? 'var(--color-border-subtle)'
                        : 'var(--color-border)',
                      borderRadius:    999,
                      marginTop:       4,
                    }}
                    aria-hidden
                  />
                )}
              </div>

              {/* ── Content column ── */}
              <div
                style={{
                  flex:           1,
                  paddingBottom:  isLast ? 0 : 20,
                  paddingLeft:    10,
                  paddingTop:     0,
                  minWidth:       0,
                }}
              >
                {/* Level badge + date row */}
                <div
                  style={{
                    display:    'flex',
                    alignItems: 'center',
                    gap:        8,
                    flexWrap:   'wrap',
                    marginBottom: 4,
                  }}
                >
                  <span
                    style={{
                      fontSize:   11,
                      fontWeight: 700,
                      color:      item.locked
                        ? 'var(--color-text-tertiary)'
                        : isTierTransition
                          ? (TIER_COLORS[item.toTier ?? currentTier] ?? 'var(--color-accent)')
                          : 'var(--color-accent)',
                      letterSpacing: '0.02em',
                    }}
                  >
                    Lv {item.level}
                  </span>

                  {dateStr && !item.locked && (
                    <span
                      style={{
                        fontSize: 10,
                        color:    'var(--color-text-tertiary)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {dateStr}
                    </span>
                  )}

                  {item.locked && (
                    <span
                      style={{
                        display:    'flex',
                        alignItems: 'center',
                        gap:        3,
                        fontSize:   10,
                        color:      'var(--color-text-tertiary)',
                        fontStyle:  'italic',
                      }}
                    >
                      <Lock size={9} aria-hidden />
                      Locked
                    </span>
                  )}
                </div>

                {/* Milestone label */}
                <p
                  style={{
                    margin:     '0 0 4px',
                    fontSize:   12,
                    lineHeight: 1.4,
                    color:      item.locked
                      ? 'var(--color-text-tertiary)'
                      : 'var(--color-text-secondary)',
                  }}
                >
                  {isTierTransition && item.toTier ? (
                    <>
                      <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>
                        TIER UP:
                      </span>{' '}
                      <span style={{ color: 'var(--color-text-tertiary)' }}>
                        {TIER_LABELS[currentTier] ?? currentTier}
                      </span>
                      {' → '}
                      <span style={{ color: TIER_COLORS[item.toTier] ?? 'var(--color-accent)', fontWeight: 600 }}>
                        {TIER_LABELS[item.toTier] ?? item.toTier}
                      </span>
                    </>
                  ) : (
                    item.label
                  )}
                </p>

                {/* Story "Read" button */}
                {isStory && !item.locked && item.storyId !== undefined && onStoryClick && (
                  <button
                    type="button"
                    onClick={() => onStoryClick(item.storyId!, item.label)}
                    style={{
                      marginTop:       4,
                      display:         'inline-flex',
                      alignItems:      'center',
                      gap:             5,
                      fontSize:        11,
                      fontWeight:      600,
                      color:           'var(--color-accent)',
                      backgroundColor: 'var(--color-accent-soft)',
                      border:          '1px solid var(--color-accent)',
                      borderRadius:    8,
                      padding:         '3px 10px',
                      cursor:          'pointer',
                      transition:      'all 0.15s',
                      letterSpacing:   '0.02em',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--color-accent)';
                      (e.currentTarget as HTMLButtonElement).style.color = '#fff';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--color-accent-soft)';
                      (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-accent)';
                    }}
                    aria-label={`Read story: ${item.label}`}
                  >
                    <BookOpen size={11} aria-hidden />
                    Read
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
