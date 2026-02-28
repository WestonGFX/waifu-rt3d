import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { SettingsView } from '../views/SettingsView';

/**
 * Settings panel — supports two layout modes:
 * - 'drawer' (default): full-width right-side overlay with a dark backdrop
 * - 'sidebar': left-side panel that leaves the 3D viewer visible on the right
 *
 * The mode is persisted in appStore and can be changed in Settings → General → Chat Behaviour.
 */
export function SettingsDrawer() {
  const { activeOverlay, closeOverlay, settingsMode } = useAppStore();
  const open = activeOverlay === 'settings';
  const isSidebar = settingsMode === 'sidebar';

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop — lighter in sidebar mode so content stays interactive */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: isSidebar ? 0.12 : 0.3 }}
            exit={{ opacity: 0 }}
            onClick={closeOverlay}
            className="fixed inset-0 bg-black z-40"
            style={{ pointerEvents: isSidebar ? 'none' : 'auto' }}
          />
          {/* Panel */}
          <motion.div
            initial={{ x: isSidebar ? '-100%' : '100%' }}
            animate={{ x: 0 }}
            exit={{ x: isSidebar ? '-100%' : '100%' }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="fixed top-0 bottom-0 z-50 flex flex-col overflow-hidden"
            style={{
              [isSidebar ? 'left' : 'right']: 0,
              width: isSidebar ? 'min(480px, 40vw)' : 'min(520px, 85vw)',
              backgroundColor: 'var(--color-background)',
              borderRight: isSidebar ? '1px solid var(--color-border-subtle)' : undefined,
              borderLeft: isSidebar ? undefined : '1px solid var(--color-border-subtle)',
              boxShadow: isSidebar ? '4px 0 24px rgba(0,0,0,0.12)' : '-4px 0 24px rgba(0,0,0,0.15)',
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
