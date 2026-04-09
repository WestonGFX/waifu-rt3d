/**
 * BondStoryCard — compact card preview for a bond story entry.
 *
 * Renders a single story in one of three visual states:
 * - **Locked**: grayed out, lock icon, "Unlocks at Level N" caption.
 * - **Unlocked / unread**: accent glow border, "NEW" badge, BookOpen icon.
 * - **Read**: normal styling, checkmark icon, "Read" caption.
 *
 * A Framer Motion hover scale (1.02) provides subtle tactile feedback.
 * `onRead` is only invoked when the story is unlocked — locked cards are
 * not interactive.
 *
 * All colors use CSS variables so the component works across all 18 themes.
 *
 * @module BondStoryCard
 */

import { motion } from 'framer-motion';
import { BookOpen, Lock, CheckCircle } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════════
   Props
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Props for the {@link BondStoryCard} component.
 *
 * @example
 * ```tsx
 * // Unlocked, unread story
 * <BondStoryCard
 *   title="First Real Talk"
 *   bondLevelRequired={5}
 *   unlocked={true}
 *   viewed={false}
 *   onRead={() => openStory(5)}
 * />
 *
 * // Locked future story
 * <BondStoryCard
 *   title="A Quiet Evening"
 *   bondLevelRequired={20}
 *   unlocked={false}
 *   viewed={false}
 * />
 * ```
 */
export interface BondStoryCardProps {
  /** Story title displayed as the card heading. */
  title: string;
  /** Bond level at which the story becomes readable. */
  bondLevelRequired: number;
  /**
   * Whether the player has reached the required bond level.
   * Controls card interactivity and visual treatment.
   */
  unlocked: boolean;
  /**
   * Whether the player has already read this story.
   * Differentiates the "NEW" vs "Read" state for unlocked stories.
   */
  viewed: boolean;
  /**
   * Called when the user clicks the card.
   * Only fires when `unlocked` is true — locked cards do nothing on click.
   */
  onRead?: () => void;
}

/* ═══════════════════════════════════════════════════════════════════════════
   BondStoryCard
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * BondStoryCard — single story entry in the bond panel story list.
 *
 * Visual states:
 * - **Locked**: muted colors, lock icon, "Unlocks at Level N" sub-label.
 *   Not clickable.
 * - **Unlocked + unread**: accent-colored glow border, "NEW" pill badge,
 *   BookOpen icon. Clickable — calls `onRead`.
 * - **Unlocked + viewed**: standard surface border, green checkmark,
 *   "Read" sub-label. Clickable — calls `onRead` for re-reads.
 *
 * Hover interaction applies a subtle scale(1.02) spring so the card feels
 * physically responsive.
 *
 * @param title              - Story title.
 * @param bondLevelRequired  - Required bond level to unlock this story.
 * @param unlocked           - True when the player has reached the level.
 * @param viewed             - True when the story has been opened at least once.
 * @param onRead             - Optional callback fired on click (unlocked only).
 *
 * @example
 * ```tsx
 * <BondStoryCard
 *   title="Rainy Day"
 *   bondLevelRequired={10}
 *   unlocked={bondLevel >= 10}
 *   viewed={viewedStories.has(10)}
 *   onRead={() => navigate(`/stories/10`)}
 * />
 * ```
 */
export function BondStoryCard({
  title,
  bondLevelRequired,
  unlocked,
  viewed,
  onRead,
}: BondStoryCardProps) {
  // ── Derived state ─────────────────────────────────────────────────────
  const isNew      = unlocked && !viewed;
  const isRead     = unlocked && viewed;
  const isLocked   = !unlocked;
  const isClickable = unlocked && typeof onRead === 'function';

  // ── Border / glow treatment ───────────────────────────────────────────
  // Unlocked + unread → accent glow border to draw attention.
  // Locked            → subtle dashed border.
  // Read              → standard surface border.
  const borderStyle = isNew
    ? '1.5px solid var(--color-accent)'
    : isLocked
      ? '1px dashed var(--color-border)'
      : '1px solid var(--color-border-subtle)';

  const boxShadow = isNew
    ? '0 0 0 3px var(--color-accent-soft), 0 2px 12px color-mix(in srgb, var(--color-accent) 18%, transparent)'
    : 'none';

  // ── Colors ────────────────────────────────────────────────────────────
  const titleColor = isLocked
    ? 'var(--color-text-tertiary)'
    : 'var(--color-text)';

  const iconColor = isLocked
    ? 'var(--color-text-tertiary)'
    : isNew
      ? 'var(--color-accent)'
      : '#34d399'; // green for "read" checkmark — fixed so it reads well on all themes

  return (
    <motion.div
      whileHover={isClickable ? { scale: 1.02 } : {}}
      transition={{ type: 'spring', stiffness: 320, damping: 22 }}
      onClick={isClickable ? onRead : undefined}
      role={isClickable ? 'button' : 'article'}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onRead?.();
        }
      } : undefined}
      aria-label={
        isLocked
          ? `${title} — unlocks at level ${bondLevelRequired}`
          : isNew
            ? `${title} — new story, tap to read`
            : `${title} — already read`
      }
      aria-disabled={isLocked}
      style={{
        backgroundColor: 'var(--color-surface)',
        border:          borderStyle,
        borderRadius:    10,
        padding:         '10px 12px',
        display:         'flex',
        alignItems:      'center',
        gap:             10,
        cursor:          isClickable ? 'pointer' : 'default',
        userSelect:      'none',
        boxShadow,
        opacity:         isLocked ? 0.6 : 1,
        transition:      'opacity 0.15s, box-shadow 0.15s',
        position:        'relative',
        overflow:        'hidden',
      }}
    >
      {/* ── Icon badge ───────────────────────────────────────────────── */}
      <div
        style={{
          flexShrink:      0,
          width:           32,
          height:          32,
          borderRadius:    8,
          backgroundColor: isLocked
            ? 'var(--color-bg-secondary)'
            : isNew
              ? 'var(--color-accent-soft)'
              : 'color-mix(in srgb, #34d399 12%, transparent)',
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'center',
          color:           iconColor,
        }}
        aria-hidden
      >
        {isLocked
          ? <Lock         size={15} />
          : isNew
            ? <BookOpen   size={15} />
            : <CheckCircle size={15} />
        }
      </div>

      {/* ── Text content ─────────────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin:       0,
            fontSize:     13,
            fontWeight:   isNew ? 600 : 500,
            color:        titleColor,
            lineHeight:   1.3,
            whiteSpace:   'nowrap',
            overflow:     'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {title}
        </p>
        <p
          style={{
            margin:    '2px 0 0',
            fontSize:  11,
            color:     'var(--color-text-tertiary)',
            lineHeight: 1.3,
          }}
        >
          {isLocked
            ? `Unlocks at Level ${bondLevelRequired}`
            : isRead
              ? 'Read'
              : 'Story unlocked'
          }
        </p>
      </div>

      {/* ── "NEW" badge (only for unread unlocked stories) ───────────── */}
      {isNew && (
        <span
          style={{
            flexShrink:      0,
            fontSize:        9,
            fontWeight:      800,
            letterSpacing:   '0.10em',
            textTransform:   'uppercase',
            color:           '#fff',
            backgroundColor: 'var(--color-accent)',
            borderRadius:    6,
            padding:         '2px 6px',
            lineHeight:      1.4,
          }}
          aria-hidden
        >
          NEW
        </span>
      )}
    </motion.div>
  );
}
