import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export interface AchievementData {
  key: string;
  label: string;
  description: string;
  icon: string;
}

interface AchievementToastProps {
  achievement: AchievementData | null;
  onDismiss: () => void;
}

/**
 * Toast overlay shown when a new achievement is unlocked (M6-item21).
 * Auto-dismisses after 4 seconds. Positioned at top-center.
 */
export function AchievementToast({ achievement, onDismiss }: AchievementToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!achievement) { setVisible(false); return; }
    setVisible(true);
    const t = setTimeout(() => { setVisible(false); setTimeout(onDismiss, 350); }, 4000);
    return () => clearTimeout(t);
  }, [achievement, onDismiss]);

  return (
    <AnimatePresence>
      {visible && achievement && (
        <motion.div
          initial={{ opacity: 0, y: -24, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 28 }}
          onClick={() => { setVisible(false); setTimeout(onDismiss, 350); }}
          style={{
            position: 'fixed',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 18px',
            borderRadius: 12,
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-accent)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
            cursor: 'pointer',
            userSelect: 'none',
            minWidth: 240,
            maxWidth: 340,
          }}
          aria-live="polite"
          role="status"
        >
          <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>{achievement.icon}</span>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--color-accent)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Achievement Unlocked
            </div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text-primary)', marginTop: 1 }}>
              {achievement.label}
            </div>
            {achievement.description && (
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                {achievement.description}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
