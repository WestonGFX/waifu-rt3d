import { type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare, Users, Brain, Gamepad2, BookOpen, Settings,
  ImageIcon, MonitorPlay,
} from 'lucide-react';
import clsx from 'clsx';
import glass from '../styles/glass.module.css';
import styles from './IconRail.module.css';

/**
 * Collapsible icon rail for Focused mode.
 *
 * A thin (~48px) sidebar on the left edge showing icon-only buttons.
 * Clicking an icon expands a content panel (~280px) to its right.
 * Only one panel can be open at a time. Clicking the active icon
 * collapses the panel back.
 *
 * Uses Framer Motion AnimatePresence for smooth panel expand/collapse.
 *
 * Layout (when expanded):
 * ┌────────┬──────────────────────────────────────┐
 * │ Icons  │  Panel content (scrollable)          │
 * │ 48px   │  280px                                │
 * │        │                                       │
 * └────────┴──────────────────────────────────────┘
 */

/** Rail item configuration. */
interface RailItem {
  id: string;
  label: string;
  Icon: typeof MessageSquare;
}

const RAIL_ITEMS: RailItem[] = [
  { id: 'chat-history', label: 'Chat History', Icon: MessageSquare },
  { id: 'characters', label: 'Characters', Icon: Users },
  { id: 'memory', label: 'Memory', Icon: Brain },
  { id: 'games', label: 'Games', Icon: Gamepad2 },
  { id: 'spectator', label: 'Game Spectator', Icon: MonitorPlay },
  { id: 'lorebook', label: 'Lorebook', Icon: BookOpen },
  { id: 'portraits', label: 'Portraits', Icon: ImageIcon },
  { id: 'settings', label: 'Settings', Icon: Settings },
];

interface IconRailProps {
  /** Currently open panel ID, or null if collapsed. */
  activePanel: string | null;
  /** Called when a rail icon is clicked. */
  onPanelChange: (panelId: string | null) => void;
  /** Content to render in the expanded panel. Keyed by panel ID. */
  panelContent?: Record<string, ReactNode>;
}

/** Spring config for panel expand/collapse — deliberate, smooth. */
const panelSpring = { stiffness: 200, damping: 24 };

export function IconRail({ activePanel, onPanelChange, panelContent }: IconRailProps) {
  const handleClick = (id: string) => {
    onPanelChange(activePanel === id ? null : id);
  };

  return (
    <div className={styles.container}>
      {/* Icon column */}
      <div className={clsx(glass.panel, styles.rail)}>
        {RAIL_ITEMS.map((item) => (
          <button
            key={item.id}
            className={clsx(
              styles.railButton,
              activePanel === item.id && styles.railButtonActive,
            )}
            onClick={() => handleClick(item.id)}
            title={item.label}
          >
            <item.Icon size={20} strokeWidth={1.5} />
          </button>
        ))}
      </div>

      {/* Expandable panel */}
      <AnimatePresence>
        {activePanel && (
          <motion.div
            key={activePanel}
            className={clsx(glass.panel, styles.panel)}
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', ...panelSpring }}
          >
            <div className={styles.panelInner}>
              {/* Panel header */}
              <div className={styles.panelHeader}>
                {RAIL_ITEMS.find((i) => i.id === activePanel)?.label ?? ''}
              </div>

              {/* Panel content */}
              <div className={styles.panelContent}>
                {panelContent?.[activePanel] ?? (
                  <p style={{
                    color: 'var(--nova-text-muted)',
                    fontSize: 13,
                    padding: 16,
                  }}>
                    Coming in Phase 4
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
