/**
 * ContentRatingBadge — Displays a colored badge for a content rating level.
 *
 * Used on persona cards, chat headers, and settings panels to indicate
 * the current content ceiling at a glance.
 */

import { type ContentRatingLevel } from '@/types/content.ts';
import { getContentRatingColor } from '@/services/contentGatingService.ts';

interface ContentRatingBadgeProps {
  /** The content rating level to display. */
  level: ContentRatingLevel;
  /** Optional size variant. */
  size?: 'sm' | 'md';
  /** Optional additional class names. */
  className?: string;
}

/**
 * Renders a colored badge indicating the content rating level.
 *
 * @example
 * <ContentRatingBadge level="mature" />
 * // Renders an orange "Mature" badge
 */
export default function ContentRatingBadge({
  level,
  size = 'sm',
  className = '',
}: ContentRatingBadgeProps) {
  const { bg, label } = getContentRatingColor(level);
  const sizeClasses = size === 'sm'
    ? 'px-1.5 py-0.5 text-[10px]'
    : 'px-2 py-1 text-xs';

  return (
    <span
      className={[
        'inline-flex items-center rounded-full font-semibold text-white',
        bg,
        sizeClasses,
        className,
      ].join(' ')}
      title={`Content rating: ${label}`}
    >
      {label}
    </span>
  );
}
