/**
 * SpectatorBubble — Floating reaction bubble for game spectator mode.
 *
 * Shows ephemeral character reactions that auto-dismiss after a timeout.
 * Separate from DialogueBubble — spectator reactions don't persist in chat.
 * Uses Framer Motion for smooth slide-in/fade-out animations.
 *
 * @module components/SpectatorBubble
 */

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { SpectatorReaction } from '../lib/types';

interface Props {
  /** The most recent reactions to display (newest first). */
  reactions: SpectatorReaction[];
  /** Maximum bubbles to show simultaneously. */
  maxVisible?: number;
}

/** Auto-dismiss duration (ms) based on urgency. */
const DISMISS_NORMAL_MS = 3000;
const DISMISS_URGENT_MS = 5000;
const URGENCY_THRESHOLD = 0.6;

/** Map spectator emotions to CSS color accents. */
const EMOTION_COLORS: Record<string, string> = {
  excited: '#ff6b35',
  worried: '#ffa500',
  amused: '#ff69b4',
  surprised: '#9b59b6',
  proud: '#2ecc71',
  disappointed: '#95a5a6',
  neutral: '#7f8c8d',
  angry: '#e74c3c',
  scared: '#8e44ad',
  happy: '#f1c40f',
  sad: '#3498db',
  curious: '#1abc9c',
};

/**
 * Floating reaction bubble for game spectator mode.
 *
 * Renders up to `maxVisible` recent reactions as animated bubbles
 * that auto-dismiss. Each bubble slides in from the right and fades out.
 *
 * @param props - Component props.
 * @returns Animated reaction bubbles.
 *
 * @example
 * ```tsx
 * <SpectatorBubble reactions={spectatorReactions} maxVisible={3} />
 * ```
 */
export function SpectatorBubble({ reactions, maxVisible = 3 }: Props) {
  const [visible, setVisible] = useState<SpectatorReaction[]>([]);

  // Track visible reactions with auto-dismiss timers
  useEffect(() => {
    if (reactions.length === 0) return;
    const newest = reactions[0];
    if (!newest || visible.some((v) => v.timestamp === newest.timestamp)) return;

    setVisible((prev) => [newest, ...prev].slice(0, maxVisible));

    const dismissMs =
      newest.urgency >= URGENCY_THRESHOLD ? DISMISS_URGENT_MS : DISMISS_NORMAL_MS;
    const timer = setTimeout(() => {
      setVisible((prev) => prev.filter((r) => r.timestamp !== newest.timestamp));
    }, dismissMs);

    return () => clearTimeout(timer);
  }, [reactions, maxVisible, visible]);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '120px',
        right: '24px',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column-reverse',
        gap: '8px',
        maxWidth: '340px',
        pointerEvents: 'none',
      }}
    >
      <AnimatePresence mode="popLayout">
        {visible.map((reaction) => {
          const color = EMOTION_COLORS[reaction.emotion] || EMOTION_COLORS.neutral;
          return (
            <motion.div
              key={reaction.timestamp}
              initial={{ opacity: 0, x: 60, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.95 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              style={{
                background: 'rgba(20, 20, 30, 0.92)',
                borderLeft: `3px solid ${color}`,
                borderRadius: '12px',
                padding: '10px 14px',
                color: '#eee',
                fontSize: '13px',
                lineHeight: 1.4,
                backdropFilter: 'blur(8px)',
                boxShadow: `0 4px 20px rgba(0,0,0,0.4), 0 0 8px ${color}33`,
                pointerEvents: 'auto',
              }}
            >
              <div
                style={{
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  color,
                  marginBottom: '4px',
                  fontWeight: 600,
                }}
              >
                {reaction.emotion}
              </div>
              <div>{reaction.text}</div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
