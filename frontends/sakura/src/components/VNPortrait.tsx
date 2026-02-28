/**
 * VNPortrait — Feature B3: Visual Novel Character Portrait
 *
 * Displays the character's avatar image as a standing portrait in the VN
 * layout.  Slides in from the bottom on mount, dims slightly when the
 * user is speaking (to signal it's not the character's turn).
 *
 * If no avatar is available a silhouette placeholder is shown so the
 * layout doesn't break.
 */

import { motion } from 'framer-motion';

interface Props {
  /** Character avatar URL, or null for a placeholder. */
  avatarUrl: string | null | undefined;
  /** Character name (for accessibility). */
  charName: string;
  /** If true, the portrait dims to indicate the user is speaking. */
  dimmed?: boolean;
  /** Horizontal position of the portrait. */
  side?: 'left' | 'right';
}

/**
 * Animated character portrait for VN reader mode.
 *
 * @example
 * <VNPortrait avatarUrl={char.avatar_url} charName="Sakura" dimmed={isUserTurn} />
 */
export function VNPortrait({ avatarUrl, charName, dimmed = false, side = 'left' }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: dimmed ? 0.45 : 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 180, damping: 22 }}
      style={{
        position: 'absolute',
        bottom: 0,
        [side]: side === 'left' ? '6%' : undefined,
        right: side === 'right' ? '6%' : undefined,
        height: '72%',
        maxHeight: 520,
        aspectRatio: '0.55 / 1',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 2,
      }}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={charName}
          style={{
            height: '100%',
            objectFit: 'contain',
            objectPosition: 'bottom',
            filter: dimmed ? 'brightness(0.6) saturate(0.7)' : 'drop-shadow(0 8px 24px rgba(0,0,0,0.5))',
            transition: 'filter 0.3s ease',
          }}
          draggable={false}
        />
      ) : (
        /* Silhouette placeholder */
        <div
          aria-hidden="true"
          style={{
            height: '90%',
            aspectRatio: '0.55 / 1',
            backgroundColor: 'rgba(255,255,255,0.06)',
            borderRadius: '40% 40% 0 0',
            border: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(4px)',
          }}
        />
      )}
    </motion.div>
  );
}
