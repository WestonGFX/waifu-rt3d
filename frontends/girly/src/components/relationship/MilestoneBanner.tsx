/**
 * MilestoneBanner — Celebratory slide-in banner shown when a relationship
 * milestone is achieved.
 *
 * Animates into view from the top of the chat panel using CSS keyframes
 * defined in global.css, then auto-dismisses after 5 seconds.
 * The caller is responsible for unmounting the component after onDismiss fires.
 */

import { useEffect } from 'react';
import { Star } from 'lucide-react';

interface MilestoneBannerProps {
  /** Short title text for the milestone, e.g. "First blush". */
  title: string;
  /** Called when the banner should be removed from the DOM. */
  onDismiss: () => void;
}

/** Duration (ms) the banner stays visible before auto-dismissing. */
const AUTO_DISMISS_DELAY = 5000;

/**
 * Slide-down milestone banner with a pink gradient background.
 *
 * @example
 * {activeMilestone && (
 *   <MilestoneBanner
 *     title={activeMilestone.label}
 *     onDismiss={() => setActiveMilestone(null)}
 *   />
 * )}
 */
export default function MilestoneBanner({ title, onDismiss }: MilestoneBannerProps) {
  // Auto-dismiss after the configured delay.
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, AUTO_DISMISS_DELAY);
    return () => window.clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={[
        // Layout
        'mx-4 mt-1.5',
        // Shape
        'rounded-[24px]',
        // Pink gradient background — shimmer of celebration
        'bg-gradient-to-r from-pink-400/90 via-rose-400/90 to-fuchsia-400/90',
        // Border + glow
        'border border-pink-300/60',
        'shadow-[0_18px_42px_-24px_var(--color-glow-accent)]',
        // Padding
        'px-4 py-3',
        // Slide-in animation (keyframe defined in global.css or inline fallback)
        'animate-[milestone-slide-in_0.35s_cubic-bezier(0.22,1,0.36,1)_both]',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-3">
        {/* Left: icon + text */}
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/25 backdrop-blur-sm">
            <Star className="h-3.5 w-3.5 fill-white text-white" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/80">
              Milestone reached
            </p>
            <p className="truncate text-sm font-semibold text-white">
              {title}
            </p>
          </div>
        </div>

        {/* Dismiss button */}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss milestone"
          className={[
            'shrink-0 rounded-pill',
            'border border-white/30 bg-white/20',
            'px-2.5 py-1 text-[11px] font-medium text-white',
            'transition-[background-color,transform]',
            'duration-[var(--motion-duration-micro)] ease-[var(--motion-ease-standard)]',
            'hover:bg-white/30 active:scale-[var(--motion-scale-press)]',
          ].join(' ')}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
