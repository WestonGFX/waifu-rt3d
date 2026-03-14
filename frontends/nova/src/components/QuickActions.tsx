import { motion } from 'framer-motion';
import { Sparkles, BookOpen, Gamepad2 } from 'lucide-react';
import glass from '../styles/glass.module.css';
import clsx from 'clsx';

/**
 * Quick action pills — bottom-left in Companion mode.
 *
 * Floating glass pills for frequent actions that don't need
 * a full panel: triggering gestures, opening games, browsing lorebook.
 * Each pill springs in with staggered delay.
 */
interface QuickActionsProps {
  onGestures?: () => void;
  onLorebook?: () => void;
  onGames?: () => void;
}

const ACTIONS = [
  { key: 'gestures', Icon: Sparkles, label: 'Gestures' },
  { key: 'lorebook', Icon: BookOpen, label: 'Lorebook' },
  { key: 'games', Icon: Gamepad2, label: 'Games' },
] as const;

export function QuickActions({ onGestures, onLorebook, onGames }: QuickActionsProps) {
  const handlers: Record<string, (() => void) | undefined> = {
    gestures: onGestures,
    lorebook: onLorebook,
    games: onGames,
  };

  return (
    <motion.div
      style={{
        position: 'fixed',
        bottom: 20,
        left: 20,
        zIndex: 20,
        display: 'flex',
        gap: 6,
      }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24, delay: 0.6 }}
    >
      {ACTIONS.map((action, i) => (
        <motion.button
          key={action.key}
          className={clsx(glass.pill, glass.interactive)}
          onClick={handlers[action.key]}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            cursor: 'pointer',
          }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            type: 'spring',
            stiffness: 300,
            damping: 24,
            delay: 0.6 + i * 0.1,
          }}
        >
          <action.Icon
            size={14}
            strokeWidth={1.5}
            color="var(--nova-text-secondary)"
          />
          <span style={{
            fontSize: 11.5,
            fontWeight: 500,
            color: 'var(--nova-text-secondary)',
          }}>
            {action.label}
          </span>
        </motion.button>
      ))}
    </motion.div>
  );
}
