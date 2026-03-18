/**
 * MoodIndicator — Inline companion mood dot shown beside the persona name.
 *
 * Renders a small emoji + optional label pair that reflects the current
 * derived mood of the companion. Designed to sit inside the chat header
 * without disrupting the layout flow.
 */

/** The set of moods the companion can express. */
export type CompanionMood =
  | 'happy'
  | 'content'
  | 'pensive'
  | 'uneasy'
  | 'distant'
  | 'hurt'
  | 'neutral';

interface MoodConfig {
  /** Unicode emoji that represents this mood at a glance. */
  emoji: string;
  /** Tailwind text-color utility for the label text. */
  colorClass: string;
  /** Human-readable label shown next to the emoji. */
  label: string;
}

/** Static mood → display configuration mapping. */
const MOOD_CONFIG: Record<CompanionMood, MoodConfig> = {
  happy:   { emoji: '😊', colorClass: 'text-pink-500',  label: 'Happy'   },
  content: { emoji: '🙂', colorClass: 'text-green-500', label: 'Content' },
  pensive: { emoji: '🤔', colorClass: 'text-amber-500', label: 'Pensive' },
  uneasy:  { emoji: '😟', colorClass: 'text-orange-500',label: 'Uneasy'  },
  distant: { emoji: '😶', colorClass: 'text-slate-400', label: 'Distant' },
  hurt:    { emoji: '😢', colorClass: 'text-red-400',   label: 'Hurt'    },
  neutral: { emoji: '😐', colorClass: 'text-text-muted',label: 'Neutral' },
};

interface MoodIndicatorProps {
  /** Current companion mood. */
  mood: CompanionMood;
  /**
   * When true, renders the human-readable label beside the emoji.
   * Defaults to false for compact in-header usage.
   */
  showLabel?: boolean;
  /** Additional class names forwarded to the wrapper span. */
  className?: string;
}

/**
 * Compact mood indicator suitable for the chat header or any inline context.
 *
 * @example
 * <MoodIndicator mood="happy" />
 * <MoodIndicator mood="pensive" showLabel />
 */
export default function MoodIndicator({ mood, showLabel = false, className }: MoodIndicatorProps) {
  const config = MOOD_CONFIG[mood] ?? MOOD_CONFIG.neutral;

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs ${config.colorClass} ${className ?? ''}`}
      aria-label={`Companion mood: ${config.label}`}
      title={config.label}
    >
      <span role="img" aria-hidden="true" className="text-[0.9em] leading-none">
        {config.emoji}
      </span>
      {showLabel && (
        <span className="font-medium leading-none">{config.label}</span>
      )}
    </span>
  );
}
