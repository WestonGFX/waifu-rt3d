import { motion, AnimatePresence } from 'framer-motion';
import { getEmotionColors } from '../lib/characterTints';
import styles from './EmotionOrb.module.css';

/**
 * Mood visualization orb that reflects the character's current emotion.
 *
 * Renders in two variants based on the current Nova mode:
 *
 * **Companion mode** (`variant="companion"`):
 * Large glass orb anchored bottom-center of the viewport. Features a
 * conic-gradient inner disc that rotates continuously, creating a prismatic
 * effect. The gradient colors shift based on emotion (happy = warm golds,
 * sad = cool blues, etc.) with a 2-second CSS transition for smooth changes.
 * A pulsing glow ring behind the orb matches the emotion's glow color.
 *
 * **Focused mode** (`variant="focused"`):
 * Compact pill indicator with a colored dot and emotion label. Designed
 * to sit in the chat header without competing for attention.
 *
 * Both variants gracefully hide when emotion is null (no emotion detected).
 *
 * @example
 * ```tsx
 * // In companion mode — renders the large bottom orb
 * <EmotionOrb emotion="happy" intensity={0.8} variant="companion" />
 *
 * // In focused mode — renders inline pill
 * <EmotionOrb emotion="sad" intensity={0.6} variant="focused" />
 * ```
 */
interface EmotionOrbProps {
  /** Current emotion name from the LLM, or null when neutral/unknown. */
  emotion: string | null;
  /** Emotion intensity (0.0–1.0), affects glow opacity. */
  intensity: number;
  /** Display variant: large orb for companion, compact pill for focused. */
  variant: 'companion' | 'focused';
}

/** Spring config for the orb entrance/exit. */
const orbSpring = { stiffness: 200, damping: 22 };

export function EmotionOrb({ emotion, intensity, variant }: EmotionOrbProps) {
  const colors = getEmotionColors(emotion);
  const glowOpacity = Math.max(0.15, intensity * 0.5);

  if (variant === 'focused') {
    return (
      <AnimatePresence>
        {emotion && (
          <motion.div
            className={styles.focusedIndicator}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', ...orbSpring }}
          >
            <div
              className={styles.focusedDot}
              style={{
                background: colors.primary,
                boxShadow: `0 0 8px ${colors.glow}`,
              }}
            />
            <span className={styles.focusedLabel}>{emotion}</span>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  // Companion mode: large orb
  return (
    <AnimatePresence>
      {emotion && (
        <motion.div
          className={styles.companionOrb}
          initial={{ opacity: 0, y: 20, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.8 }}
          transition={{ type: 'spring', ...orbSpring }}
        >
          <div
            className={styles.orbRing}
            style={{
              boxShadow: `0 0 30px ${colors.glow.replace(/[\d.]+\)$/, `${glowOpacity})`)}`,
            }}
          >
            <div className={styles.orbInner}>
              <div
                className={styles.orbGradient}
                style={{
                  background: `conic-gradient(from 0deg, ${colors.primary}, ${colors.secondary}, ${colors.primary})`,
                }}
              />
            </div>
          </div>
          <span className={styles.orbLabel}>{emotion}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
