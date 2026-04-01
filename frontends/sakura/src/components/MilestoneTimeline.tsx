/**
 * MilestoneTimeline — Intimate relationship milestone viewer overlay.
 *
 * Displays a chronological vertical timeline of relationship "firsts" and
 * significant intimate moments shared between the user and a character.
 * Data is fetched from GET /api/characters/{char_id}/milestones on mount.
 *
 * Design:
 * - Right slide-in panel (480px wide), matching the MemoryBrowser/DiaryPanel pattern
 * - AnimatePresence + framer-motion for smooth open/close and staggered node reveal
 * - Vertical timeline line with accent-colored circle nodes
 * - Anniversary badge (golden) for milestones due within 7 days
 * - Full theme-awareness via CSS custom properties — no hardcoded colors (except
 *   the anniversary badge warm tones which have no CSS variable equivalent)
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Heart,
  Calendar,
  Sparkles,
  MessageCircle,
  Flame,
  Sunrise,
  CloudLightning,
  Handshake,
  Star,
  Home,
  Hand,
  Loader2,
  BookHeart,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

/** A single milestone entry returned by the API. */
interface Milestone {
  id: number;
  milestone_type: string;
  label: string;
  description: string;
  detected_at: string;
  bond_level_at_time: number;
  session_id: number;
  celebration_shown: boolean;
  anniversary_next: string | null;
}

/** Response shape of GET /api/characters/{char_id}/milestones. */
interface MilestonesResponse {
  char_id: number;
  milestones: Milestone[];
}

/** Props for the MilestoneTimeline overlay component. */
export interface MilestoneTimelineProps {
  /** Controls whether the overlay is visible. */
  isOpen: boolean;
  /** Called when the user closes the overlay. */
  onClose: () => void;
  /** ID of the character whose milestones to display. */
  characterId: number;
  /** Display name of the character, shown in the header. */
  characterName: string;
}

/* ═══════════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════════ */

/** Maps milestone_type strings to Lucide icon components. */
const MILESTONE_ICONS: Record<string, React.ReactNode> = {
  first_kiss:            <Heart       size={14} />,
  first_date:            <Calendar    size={14} />,
  first_touch:           <Hand        size={14} />,
  first_confession:      <MessageCircle size={14} />,
  first_intimate:        <Flame       size={14} />,
  first_morning_after:   <Sunrise     size={14} />,
  first_argument:        <CloudLightning size={14} />,
  first_reconciliation:  <Handshake   size={14} />,
  first_pet_name:        <Star        size={14} />,
  first_fantasy_shared:  <Sparkles    size={14} />,
  moved_in:              <Home        size={14} />,
};

/** Fallback icon for unknown milestone types. */
const FALLBACK_ICON = <BookHeart size={14} />;

/** Number of milliseconds in one day, used for anniversary proximity checks. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/* ═══════════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Format an ISO datetime string into a human-readable date and time.
 *
 * @param iso - ISO 8601 datetime string (e.g. "2026-03-10T21:15:00").
 * @returns A string like "March 10, 2026 at 9:15 PM", or the raw input on error.
 *
 * @example
 * formatDateTime("2026-03-10T21:15:00");
 * // => "March 10, 2026 at 9:15 PM"
 */
function formatDateTime(iso: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const time = d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
    return `${date} at ${time}`;
  } catch {
    return iso;
  }
}

/**
 * Determine whether a given anniversary ISO datetime falls within the next 7 days.
 *
 * @param anniversaryIso - ISO datetime string of the next anniversary, or null.
 * @returns True when the anniversary is between now and 7 days from now.
 */
function isAnniversarySoon(anniversaryIso: string | null): boolean {
  if (!anniversaryIso) return false;
  try {
    const diff = new Date(anniversaryIso).getTime() - Date.now();
    return diff >= 0 && diff <= 7 * MS_PER_DAY;
  } catch {
    return false;
  }
}

/**
 * Retrieve the Lucide icon element for a given milestone type.
 *
 * @param milestoneType - The milestone_type string from the API.
 * @returns The matching icon ReactNode, or FALLBACK_ICON when unknown.
 */
function getMilestoneIcon(milestoneType: string): React.ReactNode {
  return MILESTONE_ICONS[milestoneType] ?? FALLBACK_ICON;
}

/* ═══════════════════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════════════════ */

/** Props for an individual timeline node + card. */
interface TimelineNodeProps {
  milestone: Milestone;
  /** Animation delay in seconds for staggered fade-in. */
  delay: number;
}

/**
 * Renders a single milestone as a timeline node with an attached card.
 *
 * The node consists of:
 * - A vertical connector line (rendered as a pseudo-element via inline style hack)
 * - A circle marker with the milestone's Lucide icon
 * - A card with label, date, description, bond badge, and optional anniversary badge
 *
 * @param milestone - The milestone data object.
 * @param delay     - Framer Motion entrance delay in seconds.
 */
function TimelineNode({ milestone, delay }: TimelineNodeProps) {
  const anniversarySoon = isAnniversarySoon(milestone.anniversary_next);

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, delay, ease: 'easeOut' }}
      style={{
        display: 'flex',
        gap: '16px',
        alignItems: 'flex-start',
        position: 'relative',
      }}
    >
      {/* Timeline node: circle marker */}
      <div
        style={{
          flexShrink: 0,
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          backgroundColor: 'var(--color-accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          zIndex: 1,
          boxShadow: '0 0 0 3px var(--color-surface), 0 0 0 5px color-mix(in srgb, var(--color-accent) 30%, transparent)',
          marginTop: '2px',
        }}
      >
        {getMilestoneIcon(milestone.milestone_type)}
      </div>

      {/* Card */}
      <div
        style={{
          flex: 1,
          backgroundColor: 'var(--color-surface-raised)',
          borderRadius: 'var(--radius-card)',
          border: '1px solid var(--color-border-subtle)',
          padding: '14px 16px',
          marginBottom: '8px',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        {/* Card header: label + badges */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px',
            marginBottom: '4px',
          }}
        >
          <span
            style={{
              fontWeight: 700,
              fontSize: '0.92rem',
              color: 'var(--color-text-primary)',
              lineHeight: 1.3,
            }}
          >
            {milestone.label}
          </span>

          {/* Bond level badge */}
          <span
            style={{
              fontSize: '0.65rem',
              fontWeight: 600,
              letterSpacing: '0.04em',
              color: 'var(--color-accent)',
              backgroundColor: 'var(--color-accent-soft)',
              borderRadius: '6px',
              padding: '2px 7px',
            }}
          >
            Bond: {milestone.bond_level_at_time}
          </span>

          {/* Anniversary soon badge */}
          {anniversarySoon && (
            <span
              style={{
                fontSize: '0.65rem',
                fontWeight: 600,
                letterSpacing: '0.04em',
                color: '#f59e0b',
                backgroundColor: 'rgba(251, 191, 36, 0.15)',
                borderRadius: '6px',
                padding: '2px 7px',
                border: '1px solid rgba(245, 158, 11, 0.3)',
              }}
            >
              Anniversary soon!
            </span>
          )}
        </div>

        {/* Date */}
        <p
          style={{
            margin: '0 0 8px',
            fontSize: '0.72rem',
            color: 'var(--color-text-muted)',
            lineHeight: 1.4,
          }}
        >
          {formatDateTime(milestone.detected_at)}
        </p>

        {/* Description */}
        {milestone.description && (
          <p
            style={{
              margin: 0,
              fontSize: '0.84rem',
              color: 'var(--color-text-secondary)',
              lineHeight: 1.65,
            }}
          >
            {milestone.description}
          </p>
        )}
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   MilestoneTimeline component
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Overlay panel that shows a chronological intimate relationship timeline.
 *
 * Fetches milestones from `GET /api/characters/{characterId}/milestones` on
 * open and renders them as a vertical timeline with staggered fade-in nodes.
 * Each node shows the milestone label, timestamp, description, bond level
 * at the time, and an anniversary badge when the anniversary is within 7 days.
 *
 * The panel slides in from the right. The backdrop dismisses the overlay on click.
 * An empty state message is shown when no milestones exist yet.
 *
 * @param isOpen        - Controls overlay visibility via AnimatePresence.
 * @param onClose       - Called when the user clicks the backdrop or close button.
 * @param characterId   - Numeric ID of the character whose milestones to load.
 * @param characterName - Display name shown in the panel header.
 *
 * @example
 * <MilestoneTimeline
 *   isOpen={showTimeline}
 *   onClose={() => setShowTimeline(false)}
 *   characterId={activeChar.id}
 *   characterName={activeChar.name}
 * />
 */
export function MilestoneTimeline({
  isOpen,
  onClose,
  characterId,
  characterName,
}: MilestoneTimelineProps) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);

  /* Fetch milestones whenever the panel opens or the character changes. */
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/characters/${characterId}/milestones`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<MilestonesResponse>;
      })
      .then(data => {
        if (!cancelled) {
          // Sort chronologically — oldest first for top-to-bottom story flow
          const sorted = [...data.milestones].sort(
            (a, b) => new Date(a.detected_at).getTime() - new Date(b.detected_at).getTime(),
          );
          setMilestones(sorted);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load milestones.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [isOpen, characterId]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="milestone-timeline-backdrop"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 200,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            key="milestone-timeline-panel"
            style={{
              position: 'fixed',
              inset: '16px 16px 16px auto',
              width: '480px',
              zIndex: 201,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              backgroundColor: 'var(--color-surface)',
              borderRadius: 'var(--radius-card)',
              boxShadow: 'var(--shadow-elevated)',
            }}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
          >
            {/* ── Header ── */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '18px 20px 16px',
                borderBottom: '1px solid var(--color-border-subtle)',
                flexShrink: 0,
              }}
            >
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: '1rem',
                    fontWeight: 700,
                    color: 'var(--color-text-primary)',
                    lineHeight: 1.2,
                  }}
                >
                  {characterName} — Our Story
                </h2>
                {!loading && !error && (
                  <p
                    style={{
                      margin: '3px 0 0',
                      fontSize: '0.72rem',
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    {milestones.length === 0
                      ? 'No milestones yet'
                      : `${milestones.length} milestone${milestones.length === 1 ? '' : 's'}`}
                  </p>
                )}
              </div>

              <button
                onClick={onClose}
                aria-label="Close milestone timeline"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '6px',
                  borderRadius: '8px',
                  transition: 'background 0.15s, color 0.15s',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--color-surface-raised)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-primary)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-muted)';
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* ── Body ── */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '24px 20px',
              }}
            >
              {/* Loading state */}
              {loading && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px',
                    height: '200px',
                    color: 'var(--color-text-muted)',
                  }}
                >
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  >
                    <Loader2 size={24} />
                  </motion.div>
                  <span style={{ fontSize: '0.84rem' }}>Loading your story…</span>
                </div>
              )}

              {/* Error state */}
              {!loading && error && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '200px',
                    color: 'var(--color-text-muted)',
                    fontSize: '0.84rem',
                    textAlign: 'center',
                    padding: '0 24px',
                  }}
                >
                  Could not load milestones: {error}
                </div>
              )}

              {/* Empty state */}
              {!loading && !error && milestones.length === 0 && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '16px',
                    height: '260px',
                    textAlign: 'center',
                    padding: '0 32px',
                  }}
                >
                  <div
                    style={{
                      width: '56px',
                      height: '56px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--color-accent-soft)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--color-accent)',
                    }}
                  >
                    <Heart size={24} />
                  </div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '0.9rem',
                      color: 'var(--color-text-secondary)',
                      lineHeight: 1.7,
                      fontStyle: 'italic',
                    }}
                  >
                    No milestones yet. Your story together is just beginning…
                  </p>
                </div>
              )}

              {/* Timeline */}
              {!loading && !error && milestones.length > 0 && (
                <div
                  style={{
                    position: 'relative',
                    paddingLeft: '16px',
                  }}
                >
                  {/* Vertical timeline line */}
                  <div
                    style={{
                      position: 'absolute',
                      left: '31px',   // 16px padding + half of 32px node = 32px, minus 1px
                      top: '16px',
                      bottom: '16px',
                      width: '2px',
                      backgroundColor: 'var(--color-border)',
                      borderRadius: '1px',
                    }}
                  />

                  {/* Milestone nodes */}
                  {milestones.map((m, idx) => (
                    <TimelineNode
                      key={m.id}
                      milestone={m}
                      delay={idx * 0.07}
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
