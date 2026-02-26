import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { SettingsView } from '../views/SettingsView';

/**
 * Right-side overlay drawer for Settings.
 * Wraps the existing SettingsView in a slide-out panel so users
 * can access settings without leaving the chat context.
 */
export function SettingsDrawer() {
  const { activeOverlay, closeOverlay } = useAppStore();
  const open = activeOverlay === 'settings';

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            exit={{ opacity: 0 }}
            onClick={closeOverlay}
            className="fixed inset-0 bg-black z-40"
          />
          {/* Drawer panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="fixed right-0 top-0 bottom-0 z-50 flex flex-col overflow-hidden"
            style={{
              width: 'min(520px, 85vw)',
              backgroundColor: 'var(--color-background)',
              borderLeft: '1px solid var(--color-border-subtle)',
              boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
            }}
          >
            {/* Close bar */}
            <div
              className="flex items-center justify-between px-4 h-12 flex-shrink-0"
              style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
            >
              <span className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                Settings
              </span>
              <button
                onClick={closeOverlay}
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                <X size={16} />
              </button>
            </div>
            {/* Settings content */}
            <div className="flex-1 overflow-y-auto">
              <SettingsView />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
