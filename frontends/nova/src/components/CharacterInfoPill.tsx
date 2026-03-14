import { motion } from 'framer-motion';
import glass from '../styles/glass.module.css';

/**
 * Character info pill — floats top-center in Companion mode.
 *
 * Shows the active character's avatar, name, and online status.
 * Animates in with a spring slide-down on mount.
 */
interface CharacterInfoPillProps {
  name: string;
  avatarUrl?: string;
  status?: string;
}

export function CharacterInfoPill({ name, avatarUrl, status = 'Online' }: CharacterInfoPillProps) {
  return (
    <motion.div
      className={glass.pill}
      style={{
        position: 'fixed',
        top: 20,
        left: '50%',
        zIndex: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 16px 6px 6px',
      }}
      initial={{ opacity: 0, x: '-50%', y: -12 }}
      animate={{ opacity: 1, x: '-50%', y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24, delay: 0.2 }}
    >
      {/* Avatar */}
      <div style={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        background: avatarUrl
          ? `url(${avatarUrl}) center/cover`
          : 'linear-gradient(135deg, var(--nova-accent-pink), var(--nova-accent-primary))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 14,
        flexShrink: 0,
      }}>
        {!avatarUrl && name.charAt(0)}
      </div>

      {/* Name + Status */}
      <div>
        <div style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--nova-text-primary)',
          letterSpacing: '0.01em',
          lineHeight: 1.2,
        }}>
          {name}
        </div>
        <div style={{
          fontSize: 10,
          color: 'var(--nova-text-secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}>
          <span
            className="nova-status-pulse"
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#a6d189',
              display: 'inline-block',
            }}
          />
          {status}
        </div>
      </div>
    </motion.div>
  );
}
