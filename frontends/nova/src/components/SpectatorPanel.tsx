import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, Gamepad2, Monitor } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import type { SpectatorReaction, SpectatorFrequency } from '../lib/types';
import styles from './SpectatorPanel.module.css';

// ── Constants ────────────────────────────────────────────────────────────────

/** Maximum number of reactions visible in the feed (newest first). */
const MAX_REACTIONS = 8;

/** Frequency preset definitions with display labels and approximate intervals. */
const FREQUENCY_PRESETS: Array<{ value: SpectatorFrequency; label: string; interval: string }> = [
  { value: 'quiet',  label: 'Quiet',  interval: '~45s' },
  { value: 'normal', label: 'Normal', interval: '~15s' },
  { value: 'hyped',  label: 'Hyped',  interval: '~6s' },
];

/** Emotion-to-CSS-class mapping for reaction tag colors. */
const EMOTION_CLASS_MAP: Record<string, string> = {
  excited:   styles.emotionExcited,
  amused:    styles.emotionAmused,
  worried:   styles.emotionWorried,
  proud:     styles.emotionProud,
  surprised: styles.emotionSurprised,
};

/** Spring config for reaction card entrance animations. */
const reactionSpring = { type: 'spring' as const, stiffness: 300, damping: 28 };

/**
 * Format a Unix timestamp (ms) to a compact time string (HH:MM:SS).
 *
 * @param ts - Timestamp in milliseconds since epoch.
 * @returns Formatted time string, e.g. "14:03:22".
 */
function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * Glass-styled game spectator/companion panel for Nova's Focused mode.
 *
 * The character watches you play games and reacts in real time. Provides
 * a game name input, mode toggle (Watch Me Play vs AI Plays), frequency
 * selector (Quiet/Normal/Hyped), start/stop controls, and a scrolling
 * reaction feed showing the character's emotional responses.
 *
 * **Note:** The actual screen capture + WebSocket connection to `/ws/spectator`
 * requires `getDisplayMedia` and the full `useGameSpectator` hook. This
 * implementation provides the complete UI shell with a placeholder capture
 * function. The full hook can be ported separately.
 *
 * @example
 * ```tsx
 * // Rendered inside IconRail's panelContent map
 * <SpectatorPanel />
 * ```
 */
export function SpectatorPanel() {
  const activeCharacter = useAppStore((s) => s.activeCharacter);

  // Local panel state
  const [gameTag, setGameTag] = useState('');
  const [frequency, setFrequency] = useState<SpectatorFrequency>('normal');
  const [isActive, setIsActive] = useState(false);
  const [reactions, setReactions] = useState<SpectatorReaction[]>([]);

  /**
   * Start the spectator session.
   *
   * This is a placeholder that activates the UI and adds a mock reaction.
   * The full implementation requires porting `useGameSpectator` with
   * `getDisplayMedia` screen capture and a WebSocket connection to
   * `/ws/spectator`.
   */
  const startCapture = useCallback(() => {
    if (!gameTag.trim() || !activeCharacter) return;
    setIsActive(true);
    // Placeholder: add an initial mock reaction to demonstrate the feed
    setReactions([{
      text: `I'm watching ${gameTag}! Let's go!`,
      emotion: 'excited',
      urgency: 0.8,
      timestamp: Date.now(),
    }]);
  }, [gameTag, activeCharacter]);

  /**
   * Stop the spectator session and clear the active state.
   * Reactions are preserved so the user can review them.
   */
  const stopCapture = useCallback(() => {
    setIsActive(false);
  }, []);

  /**
   * Resolve the CSS class for an emotion tag pill.
   *
   * @param emotion - Emotion string from the spectator reaction.
   * @returns Composed CSS class string for the emotion tag.
   */
  const getEmotionClass = (emotion: string): string => {
    return EMOTION_CLASS_MAP[emotion.toLowerCase()] ?? styles.emotionDefault;
  };

  const charName = activeCharacter?.name ?? 'Character';

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className={styles.container}>
      {/* Status indicator */}
      <div className={styles.statusRow}>
        <div className={`${styles.statusDot} ${isActive ? styles.statusDotActive : ''}`} />
        <span className={styles.statusText}>
          {isActive ? `Watching ${gameTag}...` : 'Inactive'}
        </span>
      </div>

      {/* Game name input */}
      <input
        className={styles.gameInput}
        value={gameTag}
        onChange={(e) => setGameTag(e.target.value)}
        placeholder="Game name (e.g. PokeRogue)..."
        disabled={isActive}
      />

      {/* Mode toggle: Watch Me Play / AI Plays */}
      <div className={styles.modeRow}>
        <button className={`${styles.modePill} ${styles.modePillActive}`}>
          <Eye size={13} />
          Watch Me Play
        </button>
        <button className={`${styles.modePill} ${styles.modePillDisabled}`} disabled>
          <Gamepad2 size={13} />
          <span>AI Plays</span>
          <span className={styles.comingSoon}>soon</span>
        </button>
      </div>

      {/* Frequency selector */}
      <div className={styles.frequencyLabel}>Reaction Frequency</div>
      <div className={styles.frequencyRow}>
        {FREQUENCY_PRESETS.map((preset) => (
          <button
            key={preset.value}
            className={`${styles.freqPill} ${frequency === preset.value ? styles.freqPillActive : ''}`}
            onClick={() => setFrequency(preset.value)}
            disabled={isActive}
          >
            {preset.label}
            <span className={styles.freqInterval}>{preset.interval}</span>
          </button>
        ))}
      </div>

      {/* Start / Stop button */}
      {isActive ? (
        <button className={styles.actionButtonStop} onClick={stopCapture}>
          Stop Watching
        </button>
      ) : (
        <button
          className={styles.actionButton}
          onClick={startCapture}
          disabled={!gameTag.trim() || !activeCharacter}
        >
          <Monitor size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
          Start Watching
        </button>
      )}

      {/* Divider before reactions */}
      {reactions.length > 0 && <div className={styles.divider} />}

      {/* Reaction feed */}
      <div className={styles.reactionFeed}>
        <AnimatePresence initial={false}>
          {reactions.slice(0, MAX_REACTIONS).map((reaction, i) => (
            <motion.div
              key={`${reaction.timestamp}-${i}`}
              initial={{ opacity: 0, y: -12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.95 }}
              transition={reactionSpring}
            >
              <div className={styles.reactionCard}>
                <div className={styles.reactionHeader}>
                  <span className={`${styles.emotionTag} ${getEmotionClass(reaction.emotion)}`}>
                    {reaction.emotion}
                  </span>
                  <span className={styles.reactionTimestamp}>
                    {formatTime(reaction.timestamp)}
                  </span>
                </div>
                <div className={styles.reactionText}>
                  &ldquo;{reaction.text}&rdquo;
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Empty reactions state (when active but no reactions yet, or when idle) */}
      {!isActive && reactions.length === 0 && (
        <div className={styles.emptyReactions}>
          <Eye size={28} className={styles.emptyIcon} />
          <div className={styles.emptyText}>
            {charName} will watch you play and react in real time. Enter a game name and start watching.
          </div>
        </div>
      )}
    </div>
  );
}
