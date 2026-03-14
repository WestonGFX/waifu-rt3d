import { motion } from 'framer-motion';
import glass from '../styles/glass.module.css';

/**
 * Companion/Focused mode toggle pill.
 *
 * Floats in the top-right corner of the viewport. The active mode
 * gets an accent-tinted background; the inactive mode is transparent.
 * Animates in with a spring-based slide-down on mount.
 *
 * @param mode - Current active mode
 * @param onToggle - Callback when user clicks the other mode
 */
interface ModeToggleProps {
  mode: 'companion' | 'focused';
  onToggle: () => void;
}

export function ModeToggle({ mode, onToggle }: ModeToggleProps) {
  return (
    <motion.div
      className={glass.pill}
      style={{
        position: 'fixed',
        top: 20,
        right: 20,
        zIndex: 20,
        display: 'flex',
        gap: 2,
        padding: 3,
      }}
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24, delay: 0.4 }}
    >
      <ModeButton
        label="Companion"
        active={mode === 'companion'}
        onClick={() => mode !== 'companion' && onToggle()}
      />
      <ModeButton
        label="Focused"
        active={mode === 'focused'}
        onClick={() => mode !== 'focused' && onToggle()}
      />
    </motion.div>
  );
}

function ModeButton({ label, active, onClick }: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '7px 16px',
        borderRadius: 18,
        border: 'none',
        background: active ? 'rgba(255,141,161,0.15)' : 'transparent',
        color: active ? 'var(--nova-accent-pink)' : 'var(--nova-text-secondary)',
        fontFamily: "'Outfit', sans-serif",
        fontSize: 12,
        fontWeight: 500,
        cursor: 'pointer',
        letterSpacing: '0.02em',
        transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
        boxShadow: active ? '0 0 12px rgba(255,141,161,0.08)' : 'none',
      }}
    >
      {label}
    </button>
  );
}
