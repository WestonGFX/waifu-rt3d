import { motion } from 'framer-motion';
import { Users, Settings, Search } from 'lucide-react';
import glass from '../styles/glass.module.css';
import clsx from 'clsx';

/**
 * Floating navigation dots — top-left in Companion mode.
 *
 * Three glass circles providing access to:
 * 1. Character switcher
 * 2. Settings
 * 3. Command palette (⌘K)
 *
 * Each dot springs in with a staggered delay for a cascading reveal.
 * Minimal chrome — icons only, no labels. Hover reveals a subtle glow.
 */
interface FloatingNavProps {
  onCharacterSwitch?: () => void;
  onSettings?: () => void;
  onCommandPalette?: () => void;
}

const NAV_ITEMS = [
  { key: 'characters', Icon: Users, label: 'Switch Character' },
  { key: 'settings', Icon: Settings, label: 'Settings' },
  { key: 'search', Icon: Search, label: 'Command Palette ⌘K' },
] as const;

export function FloatingNav({ onCharacterSwitch, onSettings, onCommandPalette }: FloatingNavProps) {
  const handlers: Record<string, (() => void) | undefined> = {
    characters: onCharacterSwitch,
    settings: onSettings,
    search: onCommandPalette,
  };

  return (
    <motion.div
      style={{
        position: 'fixed',
        top: 20,
        left: 20,
        zIndex: 20,
        display: 'flex',
        gap: 8,
      }}
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24, delay: 0.3 }}
    >
      {NAV_ITEMS.map((item, i) => (
        <motion.button
          key={item.key}
          className={clsx(glass.panelStrong, glass.interactive)}
          onClick={handlers[item.key]}
          title={item.label}
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: 0,
          }}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            type: 'spring',
            stiffness: 300,
            damping: 24,
            delay: 0.3 + i * 0.1,
          }}
        >
          <item.Icon
            size={18}
            strokeWidth={1.5}
            color="var(--nova-text-secondary)"
          />
        </motion.button>
      ))}
    </motion.div>
  );
}
